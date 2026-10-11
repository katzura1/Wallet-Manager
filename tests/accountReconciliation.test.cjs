// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('account reconciliation preserves history and excludes adjustments from operating reports', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-10T17:30:00Z'));
    const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    const results = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const accounts = await import('/src/db/accounts.ts');
      const txs = await import('/src/db/transactions.ts');
      const { createBackupData, importJSON } = await import('/src/lib/backup.ts');
      const { getRecurringDetectionSuggestions } = await import('/src/services/recurringDetection.ts');
      const stamp = new Date().toISOString();
      const equal = (actual, expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      };
      const rejects = async fn => {
        let rejected = false;
        try { await fn(); } catch { rejected = true; }
        equal(rejected, true);
      };
      const seed = async (initialBalance = 1000000) => {
        await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
        await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance, currentBalance: initialBalance, isArchived: false, createdAt: stamp, updatedAt: stamp });
        await db.categories.add({ id: 1, name: 'Belanja', type: 'both', icon: '🛒', color: '#123456', isDefault: false, createdAt: stamp });
      };
      const results = [];
      const run = async (name, fn) => {
        try { await fn(); results.push(name); } catch (err) { throw new Error(`${name}: ${err.message}`); }
      };
      await seed();
      await run('positive and negative adjustments preserve originals, local dates and operating totals', async () => {
        const originalId = await txs.addTransaction({ type: 'expense', accountId: 1, amount: 100000, categoryId: 1, date: '2026-10-10', note: 'Original' });
        const original = await db.transactions.get(originalId);
        equal(await accounts.reconcileAccount(1, 1200000, 900000, 'Counted cash'), 300000);
        equal(await accounts.reconcileAccount(1, 1100000, 1200000, ''), -100000);
        equal(await db.transactions.get(originalId), original);
        equal((await db.accounts.get(1)).initialBalance, 1000000);
        equal((await db.accounts.get(1)).currentBalance, 1100000);
        const adjustments = (await db.transactions.toArray()).filter(tx => tx.isAdjustment);
        equal(adjustments.map(tx => [tx.type, tx.amount, tx.date]), [['income', 300000, '2026-10-11'], ['expense', 100000, '2026-10-11']]);
        equal(await txs.getMonthlySummary(2026, 10), { income: 0, expense: 100000, net: -100000 });
        equal(await txs.getSummaryBetween('2026-10-01', '2026-10-31'), { income: 0, expense: 100000, net: -100000 });
        equal((await txs.getYearToDateSummary(2026, 10)).totalExpense, 100000);
        equal(await txs.getCategoryExpenseData(2026, 10), { 1: 100000 });
        equal(await txs.getCategoryIncomeData(2026, 10), []);
        equal((await txs.getAccountLedger(1, '2026-10-01', '2026-10-31')).closingBalance, 1100000);
        equal(await getRecurringDetectionSuggestions(), []);
        await rejects(() => txs.updateTransaction(adjustments[0].id, { amount: 1 }));
        const count = await db.transactions.count();
        equal(await accounts.reconcileAccount(1, 1100000, 1100000, ''), 0);
        equal(await db.transactions.count(), count);
      });
      await run('stale previews and concurrent submissions cannot duplicate corrections', async () => {
        const count = await db.transactions.count();
        await rejects(() => accounts.reconcileAccount(1, 1300000, 900000, 'Stale'));
        equal(await db.transactions.count(), count);
        const outcomes = await Promise.allSettled([accounts.reconcileAccount(1, 1300000, 1100000, ''), accounts.reconcileAccount(1, 1300000, 1100000, '')]);
        equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
        equal(await db.transactions.count(), count + 1);
        equal((await db.accounts.get(1)).currentBalance, 1300000);
      });
      await run('invalid, missing and archived accounts reject without writes', async () => {
        const count = await db.transactions.count();
        for (const amount of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) await rejects(() => accounts.reconcileAccount(1, amount, 1300000, ''));
        await rejects(() => accounts.reconcileAccount(999, 0, 0, ''));
        await accounts.archiveAccount(1);
        await rejects(() => accounts.reconcileAccount(1, 0, 1300000, ''));
        equal(await db.transactions.count(), count);
        await accounts.updateAccount(1, { isArchived: false });
      });
      await run('negative credit balances and zero actual balance are supported', async () => {
        await seed(-500000);
        await db.accounts.update(1, { type: 'credit' });
        equal(await accounts.reconcileAccount(1, -650000, -500000, ''), -150000);
        equal((await db.accounts.get(1)).currentBalance, -650000);
        equal(await accounts.reconcileAccount(1, 0, -650000, ''), 650000);
        equal((await db.accounts.get(1)).currentBalance, 0);
      });
      await run('failed account write rolls back the adjustment', async () => {
        const count = await db.transactions.count();
        const fail = changes => { if (changes.currentBalance === 123000) throw new Error('Injected account write failure'); };
        db.accounts.hook('updating', fail);
        try { await rejects(() => accounts.reconcileAccount(1, 123000, 0, '')); }
        finally { db.accounts.hook('updating').unsubscribe(fail); }
        equal(await db.transactions.count(), count);
        equal((await db.accounts.get(1)).currentBalance, 0);
      });
      await run('backup round trip and deletion preserve adjustment classification and balance', async () => {
        const backup = await createBackupData();
        await importJSON(new File([JSON.stringify(backup)], 'backup.json'), 'replace');
        const adjustments = await db.transactions.toArray();
        equal(adjustments.every(tx => tx.isAdjustment), true);
        equal(await txs.getMonthlySummary(2026, 10), { income: 0, expense: 0, net: 0 });
        await txs.deleteTransaction(adjustments[1].id);
        equal((await db.accounts.get(1)).currentBalance, -650000);
        await accounts.recalculateAccountBalance(1);
        equal((await db.accounts.get(1)).currentBalance, -650000);
      });
      await seed();
      return results;
    });
    assert.equal(results.length, 6);
    console.log(results.join('\n'));
    await page.goto(url + '/accounts');
    await page.getByRole('button', { name: 'Cocokkan saldo Bank', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByRole('button', { name: 'Simpan penyesuaian', exact: true }).isDisabled(), true);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await dialog.getByLabel('Saldo aktual', { exact: true }).fill('1200000');
    await dialog.getByLabel('Catatan penyesuaian').fill('UI correction');
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/db/db.ts')).db.transactions.count()), 0);
    await page.getByRole('button', { name: 'Cocokkan saldo Bank', exact: true }).click();
    await dialog.getByLabel('Saldo aktual', { exact: true }).fill('1200000');
    await dialog.getByLabel('Catatan penyesuaian').fill('UI correction');
    await page.evaluate(async () => {
      const { addTransaction } = await import('/src/db/transactions.ts');
      await addTransaction({ type: 'expense', amount: 100000, accountId: 1, date: '2026-10-11', note: 'While modal open' });
    });
    await dialog.getByRole('button', { name: 'Simpan penyesuaian', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Saldo berubah' }).waitFor();
    await dialog.getByRole('button', { name: 'Simpan penyesuaian', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(async () => {
      const { useWalletStore } = await import('/src/stores/walletStore.ts');
      return useWalletStore.getState().accounts[0]?.currentBalance === 1200000;
    });
    await page.goto(url + '/transactions');
    const row = page.getByRole('row').filter({ hasText: 'UI correction' });
    await row.getByText('Penyesuaian saldo', { exact: true }).waitFor();
    await row.getByRole('button', { name: 'Edit UI correction', exact: true }).click();
    await page.waitForURL('**/accounts');
    await page.getByRole('button', { name: 'Cocokkan saldo Bank', exact: true }).click();
    await dialog.getByLabel('Saldo aktual', { exact: true }).fill('1200000');
    await dialog.getByText('Saldo sudah cocok. Tidak perlu penyesuaian.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Selesai', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/db/db.ts')).db.transactions.count()), 2);
    await page.goto(url + '/reports?tab=ledger&account=1');
    await page.getByRole('table').getByText('Penyesuaian saldo', { exact: true }).waitFor();
    console.log('UI preview, cancel, stale balance retry, store refresh, edit routing and ledger label');
  } finally { await browser.close(); }
});
