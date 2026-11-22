// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('reports redirect, tabs and ledger', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 800 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-11T05:00:00Z'));
    const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = '2026-10-11T00:00:00.000Z';
      await db.transaction('rw', db.tables, async () => { for (const table of db.tables) await table.clear(); });
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      await db.categories.bulkAdd([1, 2].map(id => ({ id, name: `Budget ${id}`, type: 'expense', icon: '🛒', color: '#123456', isDefault: false, createdAt: stamp })));
      await db.transactions.bulkAdd([1, 2].map(id => ({ id, type: 'expense', amount: id === 1 ? 90000 : 10000, date: '2026-10-10', categoryId: id, accountId: 1, note: '', createdAt: stamp, updatedAt: stamp })));
      await db.budgets.bulkAdd([{ categoryId: 1, amount: 100000, month: '2026-10', createdAt: stamp, recurring: true }]);
    });

    await page.goto(url + '/reports#anggaran');
    await page.waitForURL(/\/budgets$/);
    const region = page.getByRole('region', { name: 'Anggaran', exact: true });
    await region.waitFor();
    assert.ok(await region.getByRole('progressbar').count() > 0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url + '/reports?tab=ledger');
    await page.getByRole('table').waitFor();
    for (const name of ['Tanggal', 'Keterangan', 'Kategori', 'Masuk', 'Keluar', 'Saldo']) {
      await page.getByRole('columnheader', { name, exact: true }).waitFor();
    }

    // Desktop sidebar link opens the dedicated budgets page.
    await page.goto(url + '/transactions');
    await page.getByRole('link', { name: 'Anggaran', exact: true }).click();
    await page.waitForURL(/\/budgets$/);
    await page.getByRole('region', { name: 'Anggaran', exact: true }).waitFor();

    // Month carries from Reports to Budgets.
    await page.goto(url + '/reports');
    // Next month: the October budget is recurring, so November still shows the link card.
    await page.getByRole('button', { name: 'Bulan berikutnya', exact: true }).click();
    await page.getByRole('link', { name: /Anggaran · \d+% terpakai/ }).click();
    await page.waitForURL(/\/budgets\?month=2026-11$/);
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'November' }).waitFor();

    await page.goto(url + '/reports');
    await page.getByRole('tab', { name: 'Buku besar', exact: true }).click();
    await page.waitForURL(/tab=ledger/);
    await page.getByRole('table').waitFor();
    await page.getByRole('tab', { name: 'Ringkasan', exact: true }).click();
    await page.getByRole('link', { name: /Anggaran · \d+% terpakai/ }).waitFor();
    assert.ok(!page.url().includes('tab=ledger'));
  } finally { await browser.close(); }
});
