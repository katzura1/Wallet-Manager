// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('split reports, debt cash flows, payment atomicity, migration and restore', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-10T05:00:00Z'));
    await page.goto(process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174');
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    const cases = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const txs = await import('/src/db/transactions.ts');
      const debts = await import('/src/db/debts.ts');
      const { createBackupData, importJSON } = await import('/src/lib/backup.ts');
      const results = [];
      const stamp = '2026-10-10T00:00:00.000Z';
      const equal = (actual, expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      };
      const rejects = async (fn) => {
        let rejected = false;
        try { await fn(); } catch { rejected = true; }
        equal(rejected, true);
      };
      const run = async (name, fn) => {
        try { await fn(); results.push(name); } catch (err) { throw new Error(`${name}: ${err.message}`); }
      };
      const account = { id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp };
      const transaction = (amount, type = 'expense', categoryId) => ({ amount, type, categoryId, accountId: 1, date: '2026-10-10', note: '', createdAt: stamp, updatedAt: stamp });
      const reset = async () => {
        await db.transaction('rw', db.tables, async () => {
          for (const table of db.tables) await table.clear();
          await db.accounts.add(account);
          await db.categories.bulkAdd([1, 2].map(id => ({ id, name: `Category ${id}`, type: 'both', icon: '🛒', color: '#123456', isDefault: false, createdAt: stamp })));
        });
      };
      const debtData = type => ({ name: 'Test', type, amount: 500000, remaining: 500000, isSettled: false, accountId: 1, note: '' });
      await reset();
      let splitId;
      await run('split expense, reimbursement, income and period totals', async () => {
        splitId = await txs.addTransaction(transaction(100000));
        await db.transactionSplits.bulkAdd([{ transactionId: splitId, categoryId: 1, amount: 60000, note: '' }, { transactionId: splitId, categoryId: 2, amount: 40000, note: '' }]);
        equal(await txs.getCategoryExpenseData(2026, 10), { 1: 60000, 2: 40000 });
        equal(await txs.getMonthlySummary(2026, 10), { income: 0, expense: 100000, net: -100000 });
        const refund = await txs.addTransaction(transaction(20000, 'income'));
        await db.transactionSplits.bulkAdd([{ transactionId: refund, categoryId: 1, amount: 10000, note: '' }, { transactionId: refund, categoryId: 2, amount: 10000, note: '' }]);
        equal(await txs.getCategoryExpenseBetween('2026-10-01', '2026-10-31'), { 1: 50000, 2: 30000 });
        equal(await txs.getCategoryIncomeData(2026, 10), [{ categoryId: 1, amount: 10000 }, { categoryId: 2, amount: 10000 }]);
        await db.transactions.update(splitId, { categoryId: 1 });
        equal(await txs.getCategoryExpenseData(2026, 10), { 1: 50000, 2: 30000 });
        await txs.deleteTransaction(splitId);
        equal(await db.transactionSplits.where('transactionId').equals(splitId).count(), 0);
        equal(await txs.getCategoryExpenseData(2026, 10), {});
      });
      await reset();
      await run('split edit changes categories and rolls back failed split writes', async () => {
        const id = await txs.addTransaction(transaction(100000));
        await db.transactionSplits.bulkAdd([{ transactionId: id, categoryId: 1, amount: 60000, note: '' }, { transactionId: id, categoryId: 2, amount: 40000, note: '' }]);
        const edit = async () => db.transaction('rw', db.transactions, db.transactionSplits, db.accounts, async () => {
          await txs.updateTransaction(id, { amount: 120000 });
          await db.transactionSplits.where('transactionId').equals(id).delete();
          await db.transactionSplits.add({ transactionId: id, categoryId: 2, amount: 120000, note: '' });
        });
        const fail = () => { throw new Error('Injected split failure'); };
        db.transactionSplits.hook('creating', fail);
        try { await rejects(edit); } finally { db.transactionSplits.hook('creating').unsubscribe(fail); }
        equal((await db.transactions.get(id)).amount, 100000);
        equal((await db.accounts.get(1)).currentBalance, 900000);
        equal(await txs.getCategoryExpenseData(2026, 10), { 1: 60000, 2: 40000 });
        await edit();
        equal(await txs.getCategoryExpenseData(2026, 10), { 2: 120000 });
        equal((await txs.getCategoryTrends(2026, 10))[0].currentMonth, 120000);
      });
      for (const type of ['owe', 'owed']) {
        await reset();
        await run(`${type}: debt cash flows excluded; payment edit, period change and settlement`, async () => {
          const id = await debts.addDebt(debtData(type));
          equal((await db.accounts.get(1)).currentBalance, type === 'owe' ? 1500000 : 500000);
          await debts.payDebt(id, 100000, '2026-10-10', '', 1);
          const payment = (await debts.getDebtPayments(id))[0];
          await debts.updateDebtPayment(payment.id, { amount: 150000, date: '2026-09-30', note: 'Edited' });
          const linked = await db.transactions.get(payment.transactionId);
          equal([linked.amount, linked.date, linked.note, linked.debtId], [150000, '2026-09-30', 'Edited', id]);
          equal((await db.accounts.get(1)).currentBalance, type === 'owe' ? 1350000 : 650000);
          equal((await db.debts.get(id)).remaining, 350000);
          equal(await txs.getMonthlySummary(2026, 10), { income: 0, expense: 0, net: 0 });
          equal(await txs.getSummaryBetween('2026-01-01', '2026-12-31'), { income: 0, expense: 0, net: 0 });
          equal((await txs.getYearToDateSummary(2026, 10)).netSavings, 0);
          equal(await txs.getCategoryExpenseData(2026, 10), {});
          const ledger = await txs.getAccountLedger(1, '2026-09-01', '2026-09-30');
          equal(ledger.rows.length, 1);
          await rejects(() => txs.updateTransaction(linked.id, { amount: 1 }));
          await rejects(() => txs.deleteTransaction(linked.id));
          for (const amount of [0, -1, NaN, Infinity, 500001]) await rejects(() => debts.updateDebtPayment(payment.id, { amount, date: '2026-10-10', note: '' }));
          await rejects(() => debts.updateDebtPayment(payment.id, { amount: 150000, date: '2026-02-30', note: '' }));
          await debts.updateDebtPayment(payment.id, { amount: 500000, date: '2026-10-10', note: '' });
          equal((await db.debts.get(id)).isSettled, true);
          await debts.deleteDebtPayment(payment.id);
          equal((await db.debts.get(id)).remaining, 500000);
          equal((await db.debts.get(id)).isSettled, false);
          equal((await db.accounts.get(1)).currentBalance, type === 'owe' ? 1500000 : 500000);
        });
      }
      await reset();
      await run('no-account payment, overpayment and missing reference', async () => {
        const id = await debts.addDebt({ ...debtData('owe'), accountId: undefined });
        await debts.payDebt(id, 100000, '2026-10-10');
        const payment = (await debts.getDebtPayments(id))[0];
        await debts.updateDebtPayment(payment.id, { amount: 150000, date: '2026-10-10', note: '' });
        equal(await db.transactions.count(), 0);
        await debts.payDebt(id, 300000, '2026-10-10');
        await rejects(() => debts.updateDebtPayment(payment.id, { amount: 250000, date: '2026-10-10', note: '' }));
        equal((await db.debts.get(id)).remaining, 50000);
        await db.debtPayments.update(payment.id, { transactionId: 999 });
        await rejects(() => debts.updateDebtPayment(payment.id, { amount: 100000, date: '2026-10-10', note: '' }));
        equal((await db.debtPayments.get(payment.id)).amount, 150000);
        equal((await db.debts.get(id)).remaining, 50000);
      });
      await reset();
      await run('payment failures roll back transaction and account changes', async () => {
        const id = await debts.addDebt(debtData('owe'));
        await debts.payDebt(id, 100000, '2026-10-10', '', 1);
        const payment = (await debts.getDebtPayments(id))[0];
        const fail = () => { throw new Error('Injected write failure'); };
        db.debtPayments.hook('updating', fail);
        try { await rejects(() => debts.updateDebtPayment(payment.id, { amount: 150000, date: '2026-09-30', note: '' })); }
        finally { db.debtPayments.hook('updating').unsubscribe(fail); }
        equal((await db.transactions.get(payment.transactionId)).amount, 100000);
        equal((await db.accounts.get(1)).currentBalance, 1400000);
        equal((await db.debts.get(id)).remaining, 400000);
      });
      await run('version 8 migration repairs only explicitly linked payments', async () => {
        const Dexie = Object.getPrototypeOf(db.constructor);
        const stores = Object.fromEntries(db.tables.map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.filter(index => index.name !== 'debtId').map(index => index.src)].join(',')]));
        await db.delete();
        const old = new Dexie('WalletDB');
        old.version(8).stores(stores);
        await old.open();
        await old.table('accounts').add(account);
        await old.table('debts').add({ ...debtData('owe'), id: 1, createdAt: stamp, updatedAt: stamp });
        await old.table('transactions').bulkAdd([{ ...transaction(100000), id: 1 }, { ...transaction(500000, 'income'), id: 2, note: 'Pinjaman dari: Test' }]);
        await old.table('debtPayments').add({ id: 1, debtId: 1, transactionId: 1, amount: 150000, date: '2026-09-30', note: 'Migrated', accountId: 1, createdAt: stamp });
        old.close();
        await db.open();
        const linked = await db.transactions.get(1);
        equal([linked.debtId, linked.amount, linked.date, linked.note], [1, 150000, '2026-09-30', 'Migrated']);
        equal((await db.transactions.get(2)).debtId, undefined);
        equal((await db.accounts.get(1)).currentBalance, 1350000);
      });
      await run('backup round trip, legacy replace and merge restore', async () => {
        let backup = await createBackupData();
        const file = value => new File([JSON.stringify(value)], 'backup.json', { type: 'application/json' });
        await importJSON(file(backup), 'replace');
        equal((await db.transactions.get(1)).debtId, 1);
        equal((await db.debtPayments.get(1)).transactionId, 1);
        backup = await createBackupData();
        const legacy = structuredClone(backup);
        delete legacy.transactions[0].debtId;
        legacy.transactions[0].amount = 100000;
        await importJSON(file(legacy), 'replace');
        equal((await db.transactions.get(1)).amount, 150000);
        equal((await db.transactions.get(1)).debtId, 1);
        await db.transactions.update(1, { amount: 100000, debtId: undefined });
        await importJSON(file(legacy), 'merge');
        equal((await db.transactions.get(1)).amount, 150000);
        equal((await db.accounts.get(1)).currentBalance, 1350000);
        const unlinked = structuredClone(legacy);
        delete unlinked.debtPayments[0].transactionId;
        await importJSON(file(unlinked), 'replace');
        equal((await db.transactions.get(1)).debtId, undefined);
      });
      return results;
    });
    assert.equal(cases.length, 8);
    console.log(cases.join('\n'));
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const { addDebt, payDebt } = await import('/src/db/debts.ts');
      await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
      const stamp = new Date().toISOString();
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      const debtId = await addDebt({ name: 'UI Test', type: 'owe', amount: 500000, remaining: 500000, isSettled: false, accountId: 1, note: 'UI debt' });
      await payDebt(debtId, 100000, '2026-10-10', 'UI payment', 1);
    });
    await page.goto((process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174') + '/transactions');
    const row = page.getByRole('row').filter({ hasText: 'UI payment' });
    await row.getByText('Utang/Piutang', { exact: true }).waitFor();
    await row.getByRole('button', { name: 'Edit UI payment', exact: true }).click();
    await page.waitForURL('**/debts');
    await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Edit pembayaran', exact: true }).click();
    await dialog.getByLabel('Jumlah pembayaran', { exact: true }).fill('600000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'melebihi' }).waitFor();
    await dialog.getByLabel('Jumlah pembayaran', { exact: true }).fill('150000');
    await dialog.getByLabel('Tanggal pembayaran', { exact: true }).fill('2026-09-30');
    await dialog.getByLabel('Catatan pembayaran', { exact: true }).fill('UI edited');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.getByText('UI edited', { exact: true }).waitFor();
    const state = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const { useWalletStore } = await import('/src/stores/walletStore.ts');
      const [payment] = await db.debtPayments.toArray();
      return { amount: payment.amount, balance: (await db.accounts.get(1)).currentBalance, remaining: (await db.debts.get(payment.debtId)).remaining, storeBalance: useWalletStore.getState().accounts[0].currentBalance };
    });
    assert.deepEqual(state, { amount: 150000, balance: 1350000, remaining: 350000, storeBalance: 1350000 });
    console.log('UI debt action routing, validation and wallet refresh');

  } finally { await browser.close(); }
});
