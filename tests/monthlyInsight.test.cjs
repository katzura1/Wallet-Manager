// Run with Vite on port 5173 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('monthly insight uses period context, category IDs and validated AI output', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-10-10T05:00:00Z'));
    const url = process.env.WALLET_TEST_URL || 'http://127.0.0.1:5173';
    const prompts = [];
    let payload = { headline: 'Ringkasan tercatat', summary: 'Data sampai 10 Oktober; bulan belum selesai.', highlights: ['Tinjau kategori Belanja.'] };
    await page.route('https://semeru.gaionix.com/api/gateway/anthropic/**', async (route) => {
      const request = route.request().postDataJSON();
      const prompt = request.messages[0].content;
      prompts.push({ prompt, input: JSON.parse(prompt.split('Data laporan:\n')[1]), url: route.request().url(), model: request.model });
      await route.fulfill({ json: { content: [{ type: 'text', text: JSON.stringify(payload) }] } });
    });
    await page.goto(url);
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const stamp = new Date().toISOString();
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
        await db.accounts.add({ id: 1, name: 'Bank', type: 'bank', icon: '🏦', color: '#123456', initialBalance: 1000000, currentBalance: 1000000, isArchived: false, createdAt: stamp, updatedAt: stamp });
        await db.categories.bulkAdd([1, 2].map(id => ({ id, name: 'Belanja', type: 'both', icon: '🛒', color: '#123456', isDefault: false, createdAt: stamp })));
        const tx = (id, type, amount, date, categoryId = 1) => ({ id, type, amount, date, categoryId, accountId: 1, note: '', createdAt: stamp, updatedAt: stamp });
        await db.transactions.bulkAdd([
          tx(1, 'expense', 100000, '2026-10-09'),
          tx(2, 'income', 10000, '2026-10-09'),
          tx(3, 'expense', 900000, '2026-10-20'),
          { ...tx(4, 'income', 800000, '2026-10-09'), debtId: 1 },
          { ...tx(5, 'expense', 800000, '2026-10-09'), isAdjustment: true },
          { ...tx(6, 'transfer', 800000, '2026-09-09'), toAccountId: 1 },
        ]);
        await db.transactionSplits.bulkAdd([{ transactionId: 1, categoryId: 1, amount: 60000, note: '' }, { transactionId: 1, categoryId: 2, amount: 40000, note: '' }]);
        await db.budgets.bulkAdd([{ categoryId: 1, amount: 45000, month: '2026-10', createdAt: stamp }, { categoryId: 2, amount: 50000, month: '2026-10', createdAt: stamp }]);
      });
    });
    await page.goto(url + '/reports');
    await page.getByText(/Data sampai 2026-10-10; bulan belum selesai/).waitFor();
    await page.getByText('Insight Oktober 2026', { exact: true }).waitFor();
    assert.equal(prompts.length, 0);
    await page.evaluate(() => {
      localStorage.setItem('gemini_api_key', 'test-key');
      localStorage.setItem('gemini_model', 'gemini-2.5-flash');
    });
    await page.reload();
    await page.getByText(payload.headline, { exact: true }).waitFor();
    const { input, prompt } = prompts[0];
    assert.ok(new URL(prompts[0].url).pathname.endsWith('/api/gateway/anthropic/v1/messages'));
    assert.equal(prompts[0].model, 'sonnet');
    assert.deepEqual(input.period, { status: 'ongoing', asOf: '2026-10-10' });
    assert.deepEqual(input.summary, { income: 10000, expense: 100000, net: -90000 });
    assert.equal(input.previousSummary, null);
    assert.deepEqual(input.budget.categories.map(row => [row.categoryId, row.actual, row.remaining]), [[1, 50000, -5000], [2, 40000, 10000]]);
    assert.equal(input.budget.overBudgetCount, 1);
    assert.equal(input.budget.nearLimitCount, 1);
    assert.ok(prompt.includes('bukan saldo akun'));
    assert.ok(prompt.includes('Jangan menyimpulkan naik/turun'));

    // Invalid structure/length must use local output, with no real Gemini call.
    payload = { headline: 'x'.repeat(71), summary: 'Invalid', highlights: [123] };
    await page.clock.setFixedTime(new Date('2026-10-10T05:00:04Z'));
    const invalid = await page.evaluate(async (input) => {
      const { generateMonthlyInsight } = await import('/src/lib/monthlyInsight.ts');
      return generateMonthlyInsight({ ...input, monthLabel: 'Validasi output' });
    }, input);
    assert.equal(invalid.source, 'local');
    assert.ok(invalid.note.includes('bulan belum selesai'));
    assert.ok(!invalid.summary.includes('Dibanding bulan lalu'));
    assert.ok(!invalid.highlights.some(item => item.includes('% dari pengeluaran')));

    await page.evaluate(() => localStorage.removeItem('gemini_api_key'));
    const cases = await page.evaluate(async (input) => {
      const { generateMonthlyInsight } = await import('/src/lib/monthlyInsight.ts');
      const previousSummary = { income: 20000, expense: 100000, net: -80000 };
      return Promise.all([
        generateMonthlyInsight({ ...input, monthLabel: 'Historis', period: { status: 'completed', asOf: '2026-10-10' }, previousSummary }),
        generateMonthlyInsight({ ...input, monthLabel: 'Tanpa pembanding', period: { status: 'completed', asOf: '2026-10-10' } }),
        generateMonthlyInsight({ ...input, monthLabel: 'Mendatang', period: { status: 'future', asOf: '2026-10-10' }, previousSummary }),
      ]);
    }, input);
    assert.ok(cases[0].summary.includes('Dibanding bulan lalu'));
    assert.ok(!cases[1].summary.includes('Dibanding bulan lalu'));
    assert.equal(cases[2].headline, 'Catatan untuk Mendatang');
    assert.ok(cases[2].note.includes('Periode mendatang'));
    await page.reload();
    await page.getByRole('button', { name: 'Bulan sebelumnya', exact: true }).click();
    await page.getByText('Insight September 2026', { exact: true }).waitFor();
  } finally {
    await browser.close();
  }
});
