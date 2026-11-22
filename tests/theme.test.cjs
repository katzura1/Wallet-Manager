// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';

test('dark theme from settings applies dark tokens and persists after reload', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const readState = () => page.evaluate(() => ({
      dark: document.documentElement.classList.contains('dark'),
      background: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
    }));
    await page.goto(url + '/settings');
    await page.getByRole('button', { name: /^Tema/ }).click();
    await page.getByRole('dialog', { name: 'Tema' }).getByRole('tab', { name: 'Gelap' }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.deepEqual(await readState(), { dark: true, background: '220 35% 7%' });
    await page.reload();
    await page.getByRole('heading', { name: 'Pengaturan', exact: true }).waitFor();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.deepEqual(await readState(), { dark: true, background: '220 35% 7%' });
    await context.close();
  } finally {
    await browser.close();
  }
});
