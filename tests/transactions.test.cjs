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
      await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp });
      await db.categories.add({ id: 1, name: 'Makan', type: 'expense', icon: '🍜', color: '#123456', isDefault: false, createdAt: stamp });
    });
  });
}

async function createExpense(page) {
  await page.goto(`${url}/transactions?new=1`);
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  // The form resets when accounts/categories finish loading, so wait for them before typing.
  const tile = dialog.getByRole('radio', { name: 'Makan', exact: true });
  await tile.waitFor();
  await page.waitForTimeout(300);
  await dialog.getByLabel('Jumlah', { exact: true }).fill('50000');
  await tile.click();
  await dialog.getByPlaceholder('Tambah catatan...').fill('Makan siang');
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}

async function balance(page) {
  await page.goto(`${url}/accounts`);
  return page.locator('main').innerText();
}

for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  test(`transactions ${name}: detail and delete restores balance`, async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
      const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(url);
      await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
      await seed(page);
      await createExpense(page);
      assert.match(await balance(page), /950\.000/);
      await page.goto(`${url}/transactions`);
      await page.getByRole('button', { name: 'Lihat detail Makan siang', exact: true }).click();
      if (name === 'mobile') {
        const sheet = page.getByRole('dialog', { name: 'Detail transaksi' });
        await sheet.getByRole('button', { name: 'Edit', exact: true }).waitFor();
        await sheet.getByRole('button', { name: 'Hapus', exact: true }).click();
      } else {
        const panel = page.getByRole('region', { name: 'Detail transaksi' });
        await panel.getByRole('button', { name: 'Edit', exact: true }).waitFor();
        await panel.getByRole('button', { name: 'Hapus', exact: true }).click();
      }
      const confirm = page.getByRole('dialog', { name: 'Hapus Transaksi' });
      await confirm.waitFor();
      await confirm.getByRole('button', { name: 'Hapus', exact: true }).click();
      await page.getByRole('button', { name: 'Lihat detail Makan siang', exact: true }).waitFor({ state: 'detached' });
      assert.match(await balance(page), /1\.000\.000/);
      await context.close();
    } finally {
      await browser.close();
    }
  });
}
