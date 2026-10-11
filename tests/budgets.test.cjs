// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('budget inheritance, migration, backup and monthly UI', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-11T05:00:00Z'));
    const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    const results = await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const { setBudget, getOrInheritBudget, getBudgetsForCategoriesWithInheritance } = await import('/src/db/budgets.ts');
      const { createBackupData, importJSON } = await import('/src/lib/backup.ts');
      const equal = (actual, expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      };
      const budgetRows = rows => rows.map(({ id, categoryId, amount, month, createdAt, recurring }) => ({ id, categoryId, amount, month, createdAt, recurring }));
      const equalBudgets = (actual, expected) => equal(budgetRows(actual), budgetRows(expected));
      const stamp = '2026-10-11T00:00:00.000Z';
      const Dexie = Object.getPrototypeOf(db.constructor);
      const stores = Object.fromEntries(db.tables.map(table => [table.name, [table.schema.primKey.src, ...table.schema.indexes.map(index => index.src)].join(',')]));
      await db.delete();
      const old = new Dexie('WalletDB');
      old.version(9).stores(stores);
      await old.open();
      const legacyRows = [
        { id: 1, categoryId: 1, amount: 100000, month: '2024-12', createdAt: stamp },
        { id: 2, categoryId: 2, amount: 200000, month: '2025-01', recurring: false, createdAt: stamp },
        { id: 3, categoryId: 3, amount: 300000, month: '2025-02', recurring: true, createdAt: stamp },
      ];
      await old.table('budgets').bulkAdd(legacyRows);
      old.close();
      await db.open();
      equalBudgets(await db.budgets.toArray(), legacyRows.map(row => ({ ...row, recurring: true })));
      equal((await getOrInheritBudget(1, '2026-10')).amount, 100000);
      // Opening the upgraded database again must preserve new one-month choices.
      await setBudget(2, '2026-10', 250000, false);
      db.close();
      await db.open();
      equal((await getOrInheritBudget(2, '2026-10')).recurring, false);
      await db.budgets.clear();
      await setBudget(1, '2025-12', 100000);
      equal((await getOrInheritBudget(1, '2025-11')), null);
      equal((await getOrInheritBudget(1, '2026-01')).amount, 100000);
      equal((await getOrInheritBudget(1, '2027-02')).amount, 100000);
      await setBudget(1, '2026-03', 200000);
      await setBudget(1, '2026-03', 210000);
      equal((await getOrInheritBudget(1, '2026-02')).amount, 100000);
      equal((await getOrInheritBudget(1, '2026-04')).amount, 210000);
      await setBudget(1, '2026-04', 50000, false);
      equal((await getOrInheritBudget(1, '2026-04')).amount, 50000);
      equal((await getOrInheritBudget(1, '2026-05')).amount, 210000);
      await setBudget(2, '2026-04', 80000, false);
      equal(await getOrInheritBudget(2, '2026-05'), null);
      equal((await getBudgetsForCategoriesWithInheritance('2026-05', [1, 2, 3])).map(row => row.amount), [210000]);
      await setBudget(2, '2026-04', 0);
      equal(await getOrInheritBudget(2, '2026-04'), null);
      await setBudget(2, '2026-04', 80000, false);
      const backup = await createBackupData();
      const file = value => new File([JSON.stringify(value)], 'backup.json', { type: 'application/json' });
      await importJSON(file(backup), 'replace');
      equalBudgets(await db.budgets.toArray(), backup.budgets);
      await db.budgets.clear();
      await importJSON(file(backup), 'merge');
      equalBudgets(await db.budgets.toArray(), backup.budgets);
      const legacy = structuredClone(backup);
      legacy.budgets.forEach(row => { delete row.recurring; });
      await importJSON(file(legacy), 'replace');
      equalBudgets(await db.budgets.toArray(), backup.budgets.map(row => ({ ...row, recurring: true })));
      await db.budgets.clear();
      await importJSON(file(legacy), 'merge');
      equalBudgets(await db.budgets.toArray(), backup.budgets.map(row => ({ ...row, recurring: true })));
      // Minimal fixtures for both report entry points and the Dashboard alert.
      await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      await db.categories.bulkAdd([1, 2].map(id => ({ id, name: `Budget ${id}`, type: 'expense', icon: '🛒', color: '#123456', isDefault: false, createdAt: stamp })));
      await db.transactions.bulkAdd([1, 2].map(id => ({ id, type: 'expense', amount: id === 1 ? 90000 : 10000, date: '2026-10-10', categoryId: id, accountId: 1, note: '', createdAt: stamp, updatedAt: stamp })));
      await setBudget(1, '2024-12', 100000);
      return ['migration', 'inheritance', 'one-month overrides', 'backup replace and merge'];
    });
    assert.equal(results.length, 4);
    await page.goto(url + '/reports');
    await page.getByText('Anggaran Bulan Ini', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Atur anggaran Budget 1', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
    assert.equal(await dialog.getByRole('textbox').inputValue(), '100.000');
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    // Creating via a category without a budget defaults to recurring.
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).click();
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    // The general add button has the same default.
    await page.getByRole('button', { name: '+ Atur', exact: true }).click();
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
    await dialog.getByRole('combobox').selectOption('2');
    await dialog.getByRole('textbox').fill('150000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Bulan berikutnya', exact: true }).click();
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).locator('..').filter({ hasText: '150.000' }).waitFor();
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox').inputValue(), '150.000');
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true);
    await dialog.getByRole('checkbox').uncheck();
    await dialog.getByRole('textbox').fill('50000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).click();
    assert.equal(await dialog.getByRole('checkbox').isChecked(), false);
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    await page.getByRole('button', { name: 'Bulan berikutnya', exact: true }).click();
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).locator('..').filter({ hasText: '150.000' }).waitFor();
    await page.getByRole('button', { name: 'Atur anggaran Budget 2', exact: true }).click();
    assert.equal(await dialog.getByRole('textbox').inputValue(), '150.000');
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    await page.goto(url);
    await page.getByText('1 kategori mendekati limit bulan ini', { exact: true }).waitFor();
    console.log(results.join(', ') + ', Reports checkbox and month navigation, Dashboard inherited alert');
  } finally { await browser.close(); }
});
