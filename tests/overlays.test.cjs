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

test('overlays mobile: add form is not covered by the bottom nav', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await seed(page);
    await page.goto(`${url}/transactions?new=1`);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByRole('radio', { name: 'Makan', exact: true }).waitFor();
    const save = dialog.getByRole('button', { name: 'Simpan', exact: true });
    await save.scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      const btn = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan');
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const d = dlg.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Navigasi utama"]');
      const navTop = nav ? nav.getBoundingClientRect().top : Infinity;
      const edgeHit = document.elementFromPoint(d.left + d.width / 2, Math.min(d.bottom, innerHeight) - 2);
      return {
        btnHit: hit === btn || btn.contains(hit),
        edgeInDialog: dlg.contains(edgeHit),
        dialogBottom: Math.round(d.bottom),
        navTop,
        navCovers: !!nav && nav.contains(edgeHit),
      };
    });
    assert.equal(result.btnHit, true, 'Simpan must be the topmost element at its center');
    assert.equal(result.edgeInDialog, true, 'dialog bottom edge must be topmost');
    assert.equal(result.navCovers, false);
    assert.ok(result.dialogBottom >= 843, `dialog must reach the viewport bottom (got ${result.dialogBottom})`);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('overlays mobile: confirm dialog sits above the bottom nav', async () => {
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
      await db.categories.add({ id: 2, name: 'Kosong', type: 'expense', icon: '📦', color: '#654321', isDefault: false, createdAt: new Date().toISOString() });
    });
    await page.goto(`${url}/categories`);
    await page.getByRole('button', { name: /Hapus.*Kosong/ }).first().click();
    const confirm = page.getByRole('alertdialog');
    await confirm.waitFor();
    const ok = await page.evaluate(() => {
      const dlg = document.querySelector('[role="alertdialog"]');
      return [...dlg.querySelectorAll('button')].every((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === b || b.contains(hit);
      });
    });
    assert.equal(ok, true);
    await context.close();
  } finally {
    await browser.close();
  }
});
