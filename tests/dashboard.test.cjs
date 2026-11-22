// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';

async function seed(page) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts');
    const stamp = new Date().toISOString();
    const today = stamp.slice(0, 10);
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 950000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      await db.categories.add({ id: 1, name: 'Makan', type: 'expense', icon: '🍜', color: '#123456', isDefault: false, createdAt: stamp });
      await db.transactions.add({ amount: 50000, type: 'expense', categoryId: 1, accountId: 1, date: today, note: 'Makan siang', createdAt: stamp, updatedAt: stamp });
    });
  });
}

for (const [name, viewport, summary] of [['mobile', { width: 390, height: 844 }, 'Total saldo'], ['desktop', { width: 1280, height: 800 }, 'Ringkasan keuangan']]) {
  test(`home ${name}: empty state then seeded sections`, async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
      const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(url);
      await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: summary }).count(), 0);
      await seed(page);
      await page.reload();
      await page.getByRole('region', { name: summary }).waitFor();
      await page.getByRole('region', { name: 'Terbaru' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Mulai kelola keuanganmu' }).count(), 0);
      await page.getByRole('region', { name: 'Terbaru' }).locator('text=Makan siang >> visible=true').first().waitFor();
      if (name === 'mobile') {
        const meta = await page.getByRole('region', { name: 'Terbaru' }).getByText(/Bank · \d{2} \w{3}/).first().innerText();
        assert.match(meta, /· \d{2} \w{3}$/);
      }
      if (name === 'desktop') {
        await page.getByRole('button', { name: 'Edit Makan siang' }).click();
        await page.getByRole('dialog').waitFor();
      }
      await context.close();
    } finally {
      await browser.close();
    }
  });
}

test('home keeps the over-budget alert when debts and bills fill the attention list', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = new Date().toISOString();
      const today = stamp.slice(0, 10);
      const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
        await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 900000, isArchived: false, createdAt: stamp, updatedAt: stamp });
        await db.categories.add({ id: 1, name: 'Makan', type: 'expense', icon: '🍜', color: '#123456', isDefault: false, createdAt: stamp });
        await db.transactions.add({ amount: 100000, type: 'expense', categoryId: 1, accountId: 1, date: today, note: 'Makan besar', createdAt: stamp, updatedAt: stamp });
        await db.budgets.add({ categoryId: 1, amount: 50000, month: today.slice(0, 7), createdAt: stamp, recurring: false });
        for (const id of [1, 2, 3]) {
          await db.debts.add({ id, type: 'owe', name: `Hutang ${id}`, amount: 100000, remaining: 100000, date: today, dueDate: soon, note: '', isSettled: false, createdAt: stamp, updatedAt: stamp });
        }
      });
    });
    await page.reload();
    await page.getByRole('region', { name: 'Total saldo' }).waitFor();
    await page.getByText('Anggaran Makan').first().waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
});

test('home fills the attention list with up to 3 budget alerts when nothing else is due', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = new Date().toISOString();
      const today = stamp.slice(0, 10);
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
        await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 700000, isArchived: false, createdAt: stamp, updatedAt: stamp });
        for (const [id, name] of [[1, 'Makan'], [2, 'Transport'], [3, 'Belanja']]) {
          await db.categories.add({ id, name, type: 'expense', icon: '🍜', color: '#123456', isDefault: false, createdAt: stamp });
          await db.transactions.add({ amount: 100000, type: 'expense', categoryId: id, accountId: 1, date: today, note: `Beli ${name}`, createdAt: stamp, updatedAt: stamp });
          await db.budgets.add({ categoryId: id, amount: 100000, month: today.slice(0, 7), createdAt: stamp, recurring: false });
        }
      });
    });
    await page.reload();
    await page.getByRole('region', { name: 'Total saldo' }).waitFor();
    for (const name of ['Makan', 'Transport', 'Belanja']) {
      await page.getByText(`Anggaran ${name}`).first().waitFor();
    }
    await context.close();
  } finally {
    await browser.close();
  }
});
