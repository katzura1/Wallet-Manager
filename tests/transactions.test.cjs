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
  const tile = dialog.getByRole('radio', { name: 'Makan', exact: true });
  await tile.waitFor();
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
      const confirm = page.getByRole('alertdialog', { name: 'Hapus transaksi ini?' });
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

test('transactions: amount typed right after cold /transactions?new=1 survives data load', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await seed(page);
    // A large history makes the store refresh finish well after the form opens.
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = new Date().toISOString();
      const rows = Array.from({ length: 20000 }, (_, i) => ({ type: 'expense', amount: 1000 + i, accountId: 1, categoryId: 1, date: `2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}`, note: `Seed ${i}`, createdAt: stamp, updatedAt: stamp }));
      await db.transactions.bulkAdd(rows);
    });
    await page.goto(`${url}/transactions?new=1`);
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByLabel('Jumlah', { exact: true });
    await amount.waitFor();
    await amount.fill('75000');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    assert.equal(await amount.inputValue(), '75.000');
    await dialog.getByRole('radio', { name: 'Makan', exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('Jumlah', { exact: true }).inputValue(), '75.000');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('transactions: stored default account survives cold /transactions?new=1 data load', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await seed(page);
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = new Date().toISOString();
      await db.accounts.add({ id: 2, name: 'Dompet', type: 'cash', icon: '👛', color: '#123456', initialBalance: 0, currentBalance: 0, isArchived: false, createdAt: stamp, updatedAt: stamp });
      const rows = Array.from({ length: 20000 }, (_, i) => ({ type: 'expense', amount: 1000 + i, accountId: 1, categoryId: 1, date: `2026-0${(i % 9) + 1}-${String((i % 27) + 1).padStart(2, '0')}`, note: `Seed ${i}`, createdAt: stamp, updatedAt: stamp }));
      await db.transactions.bulkAdd(rows);
      localStorage.setItem('wallet_tx_defaults', JSON.stringify({ lastType: 'expense', expense: { accountId: '2', categoryId: '1' } }));
    });
    await page.goto(`${url}/transactions?new=1`);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Jumlah', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await dialog.getByRole('radio', { name: 'Makan', exact: true }).waitFor();
    await dialog.getByRole('button', { name: /^Akun\s*Dompet/ }).waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
});
