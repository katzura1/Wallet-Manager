// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';

test('settings on mobile: groups, theme toggle and categories navigation', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url + '/accounts');
    await page.getByRole('link', { name: 'Pengaturan', exact: true }).first().click();
    await page.waitForURL('**/settings');
    for (const name of ['Tampilan', 'Keamanan', 'Asisten AI', 'Backup', 'Zona bahaya']) {
      await page.getByRole('heading', { name, exact: true }).waitFor();
    }
    await page.getByRole('button', { name: /^Tema/ }).click();
    const theme = page.getByRole('dialog', { name: 'Tema' }).getByRole('tablist', { name: 'Tema' });
    await theme.getByRole('tab', { name: 'Gelap' }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await theme.getByRole('tab', { name: 'Terang' }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    await page.getByRole('dialog', { name: 'Tema' }).getByRole('button', { name: 'Tutup' }).click();
    await page.getByRole('link', { name: /^Kategori/ }).click();
    await page.waitForURL('**/categories');
    await page.getByRole('heading', { name: 'Kategori', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Kembali' }).click();
    await page.waitForURL('**/settings');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('categories: both-type category only appears in the Keduanya segment', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      await db.categories.add({ name: 'Campuran Uji', type: 'both', icon: '🔀', color: '#123456', isDefault: false, createdAt: new Date().toISOString() });
    });
    await page.goto(url + '/categories');
    await page.getByRole('tab', { name: /^Keduanya/ }).click();
    await page.getByText('Campuran Uji', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /^Pengeluaran/ }).click();
    assert.equal(await page.getByText('Campuran Uji', { exact: true }).count(), 0);
    await context.close();
  } finally {
    await browser.close();
  }
});
