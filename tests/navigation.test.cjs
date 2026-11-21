// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174';

async function open(browser, viewport) {
  const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(url);
  await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
  return { context, page };
}

test('mobile bottom navigation', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const { context, page } = await open(browser, { width: 390, height: 844 });
    await page.setViewportSize({ width: 390, height: 844 });
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    for (const name of ['Beranda', 'Transaksi', 'Laporan', 'Aset']) {
      await nav.getByRole('link', { name, exact: true }).waitFor();
    }
    const center = nav.getByRole('link', { name: 'Catat transaksi', exact: true });
    await center.waitFor();
    assert.equal(await nav.getByText('Keuangan').count(), 0);
    await page.goto(url + '/debts');
    await nav.getByRole('link', { name: 'Aset', exact: true }).waitFor();
    assert.equal(await nav.getByRole('link', { name: 'Aset', exact: true }).getAttribute('aria-current'), 'page');
    await center.click();
    await page.waitForFunction(() => location.pathname === '/transactions');
    await page.waitForFunction(() => !location.search.includes('new='));
    await context.close();
  } finally {
    await browser.close();
  }
});

test('desktop sidebar', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const { context, page } = await open(browser, { width: 1280, height: 800 });
    await page.setViewportSize({ width: 1280, height: 800 });
    const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
    for (const name of ['Beranda', 'Transaksi', 'Terjadwal', 'Laporan', 'Anggaran', 'Aset & akun', 'Hutang & piutang', 'Portofolio', 'Pengaturan']) {
      await nav.getByRole('link', { name, exact: true }).waitFor();
    }
    await page.getByRole('link', { name: 'Catat transaksi' }).waitFor();
    await page.getByRole('button', { name: 'Chat AI' }).waitFor();
    await nav.getByRole('link', { name: 'Terjadwal', exact: true }).click();
    await page.waitForFunction(() => location.search.includes('tab=recurring'));
    await page.getByRole('group', { name: 'Tampilan transaksi' }).getByRole('button', { name: 'Terjadwal' }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Tampilan transaksi' }).getByRole('button', { name: 'Terjadwal' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await nav.getByRole('link', { name: 'Terjadwal', exact: true }).getAttribute('aria-current'), 'page');
    assert.equal(await nav.getByRole('link', { name: 'Transaksi', exact: true }).getAttribute('aria-current'), null);
    await page.getByRole('link', { name: 'Catat transaksi' }).click();
    await page.waitForFunction(() => !location.search.includes('new='));
    await context.close();
  } finally {
    await browser.close();
  }
});
