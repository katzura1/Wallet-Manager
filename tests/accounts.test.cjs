// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';

async function seed(page) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts');
    const stamp = new Date().toISOString();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 950000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      await db.accounts.add({ id: 2, name: 'Lama', type: 'cash', icon: '💵', color: '#123456', initialBalance: 0, currentBalance: 0, isArchived: true, createdAt: stamp, updatedAt: stamp });
    });
  });
}

test('aset hub on mobile: net worth, hub links and settings gear navigate', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await seed(page);
    for (const [name, path] of [['Hutang & piutang', '/debts'], ['Portofolio', '/portfolio'], ['Pengaturan', '/settings']]) {
      await page.goto(url + '/accounts');
      await page.getByText('Kekayaan bersih', { exact: true }).waitFor();
      await page.getByText('Akun diarsipkan (1)').waitFor();
      const link = page.getByRole('link', { name: new RegExp(name === 'Pengaturan' ? '^Pengaturan$' : name) }).first();
      await link.waitFor();
      const box = await link.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${name} target ${box.width}x${box.height}`);
      await link.click();
      await page.waitForURL('**' + path);
    }
    await context.close();
  } finally {
    await browser.close();
  }
});
