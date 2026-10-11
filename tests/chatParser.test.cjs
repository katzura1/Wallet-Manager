// Run with Vite on port 5174 and Playwright available via NODE_PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('chat routes explicit intent, uses complete local periods and rejects invalid drafts', async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-10T17:30:00Z')); // Sunday 00:30 Jakarta.
    let payload = { type: 'summary', period: 'weekly' };
    const requests = [];
    const requestUrls = [];
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      requestUrls.push(route.request().url());
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }] } });
    });
    await page.goto(process.env.WALLET_TEST_URL || 'http://127.0.0.1:5174');
    await page.getByRole('heading', { name: 'Mulai kelola keuanganmu', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/db.ts');
      const { useWalletStore } = await import('/src/stores/walletStore.ts');
      const stamp = new Date().toISOString();
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) await table.clear();
        await db.accounts.bulkAdd([1, 2, 3].map(id => ({ id, name: `Bank ${id}`, type: 'bank', icon: '🏦', color: '#123456', initialBalance: 0, currentBalance: 0, isArchived: id === 3, createdAt: stamp, updatedAt: stamp })));
        await db.categories.bulkAdd([{ id: 1, name: 'Makan', type: 'expense', icon: '', color: '', isDefault: false, createdAt: stamp }, { id: 2, name: 'Gaji', type: 'income', icon: '', color: '', isDefault: false, createdAt: stamp }]);
        const tx = (id, type, amount, date) => ({ id, type, amount, date, accountId: 1, note: '', createdAt: stamp, updatedAt: stamp });
        await db.transactions.bulkAdd([
          ...Array.from({ length: 40 }, (_, i) => tx(i + 1, 'expense', 1000, '2026-10-11')),
          tx(41, 'expense', 2000, '2026-10-05'), // Monday.
          tx(42, 'expense', 9000, '2026-10-04'), // Previous Sunday.
          tx(43, 'expense', 90000, '2026-10-12'), // Future, never included.
          tx(44, 'income', 10000, '2026-10-11'),
          { ...tx(45, 'income', 800000, '2026-10-11'), debtId: 1 },
          { ...tx(46, 'expense', 800000, '2026-10-11'), isAdjustment: true },
          { ...tx(47, 'transfer', 800000, '2026-10-11'), toAccountId: 2 },
          tx(48, 'expense', 50000, '2026-09-30'),
        ]);
      });
      // A filtered store must not limit the summary's database query.
      await useWalletStore.getState().loadTransactions({ type: 'income' });
    });
    let tick = 0;
    const ask = async text => {
      await page.clock.setFixedTime(new Date(new Date('2026-10-10T17:30:00Z').getTime() + ++tick * 3000));
      return page.evaluate(async text => {
        const { parseChatMessage } = await import('/src/lib/geminiParser.ts');
        const { db } = await import('/src/db/db.ts');
        try {
          return await parseChatMessage(text, 'test-key', await db.accounts.toArray(), await db.categories.toArray());
        } catch (err) { return { error: err.message }; }
      }, text);
    };
    const weekly = await ask('berapa pengeluaran minggu ini?');
    assert.deepEqual(weekly.summaryData, { type: 'weekly', period: '2026-10-05 – 2026-10-11', income: 10000, expense: 42000, net: -32000 });
    payload = { type: 'summary', period: 'daily' };
    assert.equal((await ask('total hari ini')).summaryData.expense, 40000);
    payload = { type: 'summary', period: 'monthly' };
    assert.deepEqual((await ask('bulan ini')).summaryData, { type: 'monthly', period: '2026-10-01 – 2026-10-11', income: 10000, expense: 51000, net: -41000 });

    payload = { type: 'text', text: 'Coba batasi belanja impulsif.' };
    assert.equal((await ask('gimana mengurangi pengeluaran hari ini?')).text, payload.text);
    payload = { type: 'text', text: 'Mau pakai akun yang mana?' };
    assert.equal((await ask('beli kopi 25rb')).type, 'text');
    payload = { type: 'text', text: 'Siapkan anggaran sebelum membeli.' };
    assert.equal((await ask('besok mau beli HP 5jt')).type, 'text');

    const draft = { type: 'expense', amount: 25000, accountId: 1, categoryId: 1, date: '2026-10-11', note: 'Beli kopi' };
    payload = { type: 'transaction', transactions: [draft, { ...draft, type: 'transfer', categoryId: undefined, toAccountId: 2 }] };
    assert.equal((await ask('beli kopi 25rb pakai Bank 1 dan transfer 25rb ke Bank 2')).transactions.length, 2);
    for (const patch of [
      { amount: -25000 }, { amount: '25000' }, { date: '2026-02-30' },
      { accountId: 999 }, { accountId: 3 }, { categoryId: 2 },
      { type: 'transfer', categoryId: undefined },
      { type: 'transfer', categoryId: undefined, toAccountId: 1 },
      { type: 'transfer', categoryId: undefined, toAccountId: 3 },
    ]) {
      payload = { type: 'transaction', transactions: [{ ...draft, ...patch }] };
      assert.ok((await ask('catat transaksi')).error, JSON.stringify(patch));
    }
    payload = { type: 'summary', period: 'yearly' };
    assert.ok((await ask('tahun ini')).error);
    payload = { type: 'text', text: '' };
    assert.ok((await ask('halo')).error);
    assert.equal(await page.evaluate(async () => (await import('/src/db/db.ts')).db.transactions.count()), 48);

    const request = requests[0];
    const instructions = request.systemInstruction.parts[0].text;
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), { text: 'berapa pengeluaran minggu ini?' });
    assert.ok(instructions.includes('Tanggal lokal hari ini: 2026-10-11'));
    assert.ok(instructions.includes('Jangan mengarang nominal'));
    assert.ok(instructions.includes('Rencana'));
    assert.ok(!instructions.includes('Bank 3'));
    assert.ok(!instructions.includes('1.250.000'));

    // Exercise the caller and summary/text rendering, not only the parser.
    await page.evaluate(() => {
      localStorage.setItem('gemini_api_key', 'test-key');
      localStorage.setItem('gemini_model', 'gemini-2.5-flash');
    });
    await page.reload();
    await page.getByRole('banner').getByRole('button', { name: 'Chat AI', exact: true }).click();
    payload = { type: 'summary', period: 'weekly' };
    await page.getByPlaceholder('Ketik transaksi atau pertanyaan...').fill('berapa pengeluaran minggu ini?');
    await page.getByPlaceholder('Ketik transaksi atau pertanyaan...').press('Enter');
    await page.getByText('2026-10-05 – 2026-10-11', { exact: true }).waitFor();
    await page.getByText('Selisih', { exact: true }).waitFor();
    payload = { type: 'text', text: 'Batasi belanja impulsif minggu ini.' };
    await page.clock.setFixedTime(new Date('2026-10-10T18:00:00Z'));
    await page.getByPlaceholder('Ketik transaksi atau pertanyaan...').fill('gimana mengurangi pengeluaran?');
    await page.getByPlaceholder('Ketik transaksi atau pertanyaan...').press('Enter');
    await page.getByText(payload.text, { exact: true }).waitFor();

    payload = [draft];
    const parsed = await page.evaluate(async () => {
      const { parseTransactionText, parseReceiptImage } = await import('/src/lib/geminiParser.ts');
      const { db } = await import('/src/db/db.ts');
      const accounts = await db.accounts.toArray();
      const categories = await db.categories.toArray();
      return [
        await parseTransactionText('beli kopi 25rb', 'test-key', accounts, categories, 'gemini-2.5-flash'),
        await parseReceiptImage({ mimeType: 'image/png', base64Data: 'aW1hZ2U=' }, 'test-key', accounts, categories),
      ];
    });
    assert.ok(parsed.every(result => result.transactions[0].amount === 25000));
    assert.ok(requestUrls.every(url => new URL(url).pathname.endsWith('/models/gemini-3.8-flash:generateContent')));

  } finally {
    await browser.close();
  }
});
