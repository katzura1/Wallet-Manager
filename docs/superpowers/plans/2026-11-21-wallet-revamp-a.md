# Wallet Revamp "A · Tenang" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti tampilan app ke desain A (mobile + desktop) **tanpa mengubah data, perhitungan, atau perilaku** yang sudah ada.

**Architecture:** Revamp murni di lapisan UI. Urutannya: token warna/font dulu, lalu komponen dasar, lalu navigasi, lalu satu halaman per task. Setiap task bisa di-merge dan di-deploy sendiri. `src/db`, `src/services`, `src/types`, dan perhitungan di `src/lib` tidak disentuh, kecuali dua fungsi turunan baru di Task 3 yang hanya membaca data yang sudah ada.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (CSS var HSL di `src/index.css`), Dexie, Zustand, react-router 7, lucide-react, test dengan `node:test` (+ Playwright untuk e2e `.cjs`).

**Spec:** Canvas desain https://claude.ai/artifact/TDKFe9qFVx9DUVaQF33Dmd, baris "A · …" dan "Desktop · 1280×800". Semua angka di mockup hanya contoh dan tidak boleh di-hardcode.

## Global Constraints

- **Tidak ada perubahan skema Dexie** (`db.version(...)` tetap) dan tidak ada field baru di `src/types/index.ts`.
- `git diff master --stat -- src/db src/services src/types` harus **kosong** di akhir setiap task.
- Semua route tetap: `/`, `/transactions`, `/debts`, `/portfolio`, `/accounts`, `/reports`, `/ledger` (redirect), `/settings`, `/categories`. Param `?tab=recurring` dan `?tab=ledger` tetap berfungsi.
- Accessible name yang dipakai e2e **tidak boleh berubah**: heading `Mulai kelola keuanganmu`, tombol `Chat AI`, `Simpan`, `Batal`, `Selesai`, `Riwayat`, `Simpan penyesuaian`, `Bulan sebelumnya`, `Bulan berikutnya`, `+ Atur`, pola `Atur anggaran <kategori>`, `Cocokkan saldo <akun>`, `Edit pembayaran`, `Edit <nama>`.
- **Elemen mockup tanpa data di app jangan dibangun:** biaya admin transfer, "Dicatat lewat Asisten AI", jam transaksi (app hanya menyimpan tanggal), tema "Ikuti sistem" (store hanya `light`/`dark`), lonceng notifikasi beserta titiknya, shortcut ⌘K/⌘J/⌘↵, limit kartu kredit, jumlah cicilan.
- Font: **Plus Jakarta Sans**, di-bundle lewat npm `@fontsource-variable/plus-jakarta-sans`, jangan lewat CDN Google, supaya PWA tetap jalan offline.
- Angka uang memakai `tabular-nums` dan formatter yang sudah ada di `src/lib/utils.ts`.
- Sentuhan minimal 44×44px, kontras teks minimal 4.5:1, toggle memakai `<button role="switch" aria-checked>`.
- Breakpoint desktop: `lg` (≥1024px). Di bawah `lg`: bottom nav; di `lg` ke atas: sidebar 240px.
- Jangan menjalankan `npm run deploy` selama plan ini dikerjakan. `scripts/deploy.mjs` sedang punya perubahan yang belum di-commit dan bukan bagian dari plan ini.

## Review Focus

1. **Kekayaan bersih menghitung kartu kredit dua kali.** Debt `owe` yang `accountId`-nya akun `credit` sudah tercermin di saldo kartu yang minus, jadi jangan dikurangi lagi (test ada di Task 3).
2. **Aset tanpa harga.** Jika `unpricedAssetCount > 0`, kekayaan bersih tetap tampil, tapi dengan catatan "n aset belum ada harga", bukan angka yang diam-diam terlalu kecil (Task 3 dan Task 9).
3. **Akun diarsipkan** tidak ikut di total saldo, daftar akun utama, maupun pilihan akun di form (Task 3, Task 6, Task 9).
4. **Data kosong.** Pengguna baru harus melihat onboarding (heading `Mulai kelola keuanganmu`), bukan layar dengan Rp 0 di mana-mana. "Perlu perhatian" disembunyikan jika kosong (Task 3, Task 5).
5. **Mode gelap.** Setiap warna baru harus lewat token. `grep -rn "#[0-9A-Fa-f]\{6\}" src/pages src/components` harus kosong untuk warna yang baru ditambahkan (dicek di setiap task, test akhir di Task 12).

---

### Task 0: Persiapan aman

**Files:** tidak ada perubahan kode.

- [ ] **Step 1:** Amankan perubahan `scripts/deploy.mjs` dan `tests/deploy.test.mjs` yang belum di-commit: commit sendiri dulu, atau biarkan di `master`. Kerjakan revamp di worktree/branch `revamp-a` dari `master` (skill `superpowers:using-git-worktrees`).
- [ ] **Step 2:** Catat baseline. Run `npm run build && npm run lint && node --test tests/*.test.ts tests/deploy.test.mjs`. Expected: semua PASS. Catat juga test yang sudah gagal dari awal.
- [ ] **Step 3:** Catat baseline e2e. Jalankan `npx vite --port 5174 --strictPort` di background, lalu `NODE_PATH=$(npm root -g) node --test tests/*.test.cjs`. Expected: semua PASS. Hasilnya jadi patokan regresi untuk setiap task.
- [ ] **Step 4:** Ekspor backup JSON dari app produksi di HP (Pengaturan → Backup lokal) sebelum mencoba build baru di perangkat. Data `localhost` ada di origin terpisah, jadi tidak tercampur dengan data produksi.

### Task 1: Token desain & font

**Files:**
- Modify: `src/index.css` (blok `:root`, `.dark`, `@theme inline`, `body`)
- Modify: `package.json`, `src/main.tsx` (import font)

**Interfaces:**
- Produces: kelas Tailwind `bg-success`, `text-success`, `text-danger`, `text-warning`, `bg-success/10`, dan sejenisnya, ditambah token lama yang nilainya diperbarui.

- [ ] **Step 1:** `npm i @fontsource-variable/plus-jakarta-sans`. Tambahkan `import "@fontsource-variable/plus-jakarta-sans";` di `src/main.tsx`. Set `font-family: "Plus Jakarta Sans Variable", system-ui, sans-serif` di `body`.
- [ ] **Step 2:** Isi nilai token. Tambahkan `--success`, `--danger`, `--warning` ke `:root`, `.dark`, dan `@theme inline` (`--color-success: hsl(var(--success))`, dan seterusnya).

| token | light (`:root`) | dark (`.dark`) |
|---|---|---|
| `--background` | `220 18% 97%` | `220 35% 7%` |
| `--foreground` | `222 47% 11%` | `220 35% 93%` |
| `--card` | `0 0% 100%` | `220 26% 11%` |
| `--border` | `220 19% 94%` | `219 22% 18%` |
| `--muted-foreground` | `219 12% 41%` | `218 15% 65%` |
| `--surface-2` | `217 22% 93%` | `221 25% 15%` |
| `--primary` / `--ring` | `232 69% 52%` | `231 100% 72%` |
| `--success` | `156 79% 27%` | `151 65% 54%` |
| `--danger` | `358 67% 45%` | `359 100% 71%` |
| `--warning` | `26 90% 37%` | `37 91% 55%` |

- [ ] **Step 3:** Run `npm run build && npm run lint`. Expected: PASS.
- [ ] **Step 4:** Jalankan semua e2e seperti di Task 0 Step 3. Expected: sama dengan baseline.
- [ ] **Step 5:** Commit `style: apply design A tokens and Plus Jakarta Sans`.

### Task 2: Komponen dasar

**Files:**
- Modify: `src/components/ui/index.tsx` (tambahkan export; API `Button`, `Card`, `Modal`, `Input`, `Select`, `EmptyState` yang sudah ada tetap sama)

**Interfaces:**
- Produces:
  - `PageHeader({ title: string; back?: string; actions?: React.ReactNode })`: `<header>` berisi `<h1>`; `back` adalah path untuk tombol kembali dengan aria-label `Kembali`.
  - `SegmentedControl<T extends string>({ label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void })`: `role="tablist"`, tiap opsi `role="tab"` + `aria-selected`.
  - `Switch({ label: string; checked: boolean; onChange(v: boolean): void })`: `<button role="switch" aria-checked>`.
  - `ProgressBar({ value: number; max: number; tone?: "primary" | "warning" | "danger" | "success"; label: string })`: `role="progressbar"`, lebar di-clamp 0–100%.
  - `ListGroup({ title?: string; children })` dan `ListRow({ label; sub?; value?; href?; onClick?; tone?: "default" | "danger" })`: kartu ber-border dengan baris setinggi minimal 46px.
  - `Sheet({ open; onClose; title; children })`: bottom sheet di bawah `lg`, modal di tengah di `lg` ke atas, dengan focus trap + Escape seperti action sheet di `AppLayout`.

- [ ] **Step 1:** Implementasikan komponen di atas. Hanya pakai token Task 1, tanpa hex langsung.
- [ ] **Step 2:** Run `npm run build && npm run lint`. Expected: PASS. Komponen belum dipakai, jadi tidak ada perubahan visual.
- [ ] **Step 3:** Commit `feat(ui): add design A primitives`.

### Task 3: Fungsi turunan (kekayaan bersih & perlu perhatian)

Hanya membaca data yang sudah ada, tanpa penyimpanan baru.

**Files:**
- Create: `src/lib/netWorth.ts`, `src/lib/attention.ts`
- Test: `tests/netWorth.test.ts`, `tests/attention.test.ts`

**Interfaces:**
- Consumes: `Account`, `Debt` dari `src/types`; `getPortfolioMetrics` dari `src/lib/portfolioMetrics.ts`.
- Produces:
  - `getNetWorth(accounts: Account[], portfolio: { totalValue: number; unpricedAssetCount: number }, debts: Debt[]): { cash: number; investments: number; debtNet: number; total: number; unpricedAssetCount: number }`
  - `type AttentionItem = { kind: "bill" | "budget" | "debt"; key: string; title: string; detail: string; amount?: number; percent?: number; href: string }`
  - `getAttentionItems(input: { today: string; bills: { id: number; name: string; amount: number; nextDate: string }[]; budgets: { categoryId: number; name: string; used: number; limit: number }[]; debts: Debt[] }, max = 3): AttentionItem[]`

- [ ] **Step 1: Tulis test yang gagal**

```ts
test("net worth skips archived accounts and credit-card owe debts", () => {
  const r = getNetWorth(
    [acc("BCA", "bank", 1000), acc("Lama", "bank", 500, true), acc("CC", "credit", -200, false, 9)],
    { totalValue: 300, unpricedAssetCount: 0 },
    [debt("owe", 200, 9), debt("owe", 100), debt("owed", 50)],
  );
  assert.deepEqual(r, { cash: 800, investments: 300, debtNet: -50, total: 1050, unpricedAssetCount: 0 });
});
test("net worth ignores settled debts", () => { /* isSettled: true → debtNet 0 */ });
test("attention: bills within 7 days, budgets >= 80%, debts due within 7 days or overdue", () => {
  const items = getAttentionItems({ today: "2026-11-21",
    bills: [bill("PLN", 450000, "2026-11-24"), bill("Netflix", 54000, "2026-12-05")],
    budgets: [budget("Makan", 1770000, 2050000), budget("Transport", 600000, 1200000)],
    debts: [debt("owe", 800000, undefined, "2026-11-20")] }, 3);
  assert.deepEqual(items.map((i) => i.key), ["debt-1", "bill-1", "budget-1"]);
});
test("attention returns [] when nothing qualifies", () => { /* semua di luar ambang → [] */ });
```
Helper `acc`/`debt`/`bill`/`budget` dibuat di file test, dengan pola yang sama seperti `asset()` di `tests/portfolioMetrics.test.ts`.

- [ ] **Step 2:** Run `node --test tests/netWorth.test.ts tests/attention.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implementasikan.
  - `getNetWorth`: `debtNet` = `owed` belum lunas dikurangi `owe` belum lunas yang akunnya bukan `credit`.
  - `key` = `` `${kind}-${id}` `` (budget memakai `categoryId`).
  - `getAttentionItems`: urutan hasil adalah debt overdue/jatuh tempo, lalu bill (tanggal naik), lalu budget (persen turun). Jumlah hasil dibatasi `max`.
  - `href`: bill → `/transactions?tab=recurring`, budget → `/reports#anggaran`, debt → `/debts`.
- [ ] **Step 4:** Run lagi. Expected: PASS.
- [ ] **Step 5:** Commit `feat(lib): derive net worth and attention items`.

### Task 4: Navigasi mobile + sidebar desktop

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`, `src/components/layout/AppLayout.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Test: `tests/navigation.test.cjs` (Playwright, pola seperti `tests/budgets.test.cjs`)

**Interfaces:**
- Produces:
  - Bottom nav: link `Beranda` (`/`), `Transaksi`, tombol tengah `Catat transaksi` → `/transactions?new=1`, `Laporan`, `Aset` (`/accounts`; aktif juga di `/debts`, `/portfolio`, `/settings`, `/categories`).
  - Sidebar `lg+`: tombol `+ Catat transaksi` lalu link `Beranda`, `Transaksi`, `Terjadwal` (`/transactions?tab=recurring`), `Laporan`, `Anggaran` (`/reports#anggaran`), `Aset & akun` (`/accounts`), `Hutang & piutang`, `Portofolio`, `Pengaturan`, plus tombol `Chat AI`. Link aktif memakai `aria-current="page"`.

- [ ] **Step 1:** Tulis `tests/navigation.test.cjs`:
  - Di viewport 390×844: 4 link tersebut + tombol `Catat transaksi` ada. Di `/debts`, link `Aset` punya `aria-current="page"`.
  - Di 1280×800: 9 link sidebar ada, dan `Terjadwal` membuka tab recurring (tab `aria-selected` / heading recurring terlihat).
- [ ] **Step 2:** Jalankan. Expected: FAIL.
- [ ] **Step 3:** Implementasikan.
  - Header atas `lg` diganti sidebar. Layout `lg` menjadi `grid-cols-[240px_1fr]`.
  - FAB `pageAction` **tetap** dulu. FAB baru dihapus di Task 12, setelah semua halaman memindahkan aksinya ke `PageHeader`.
  - `Transactions` membuka `TransactionForm` saat `?new=1`, lalu menghapus param itu.
- [ ] **Step 4:** Test navigasi + semua e2e lama. Expected: PASS.
- [ ] **Step 5:** Commit `feat(layout): design A bottom nav and desktop sidebar`.

### Task 5: Beranda (`Dashboard.tsx`)

**Files:** Modify `src/pages/Dashboard.tsx`.

**Interfaces:** Consumes `getNetWorth`, `getAttentionItems` (Task 3) dan primitives (Task 2).

- [ ] **Step 1:** Tambahkan ke `tests/navigation.test.cjs`: setelah seed 1 akun + 1 transaksi, Beranda menampilkan section `Total saldo` dan `Terbaru`. Saat data kosong, heading `Mulai kelola keuanganmu` masih ada. Run, Expected: FAIL pada section baru.
- [ ] **Step 2:** Susun ulang sesuai artboard "A · Tenang — Beranda" / "A — Desktop beranda":
  - mobile: header, Total saldo, kartu arus kas bulan ini, "Perlu perhatian" (hanya jika ada item), "Terbaru" (2–5 item)
  - desktop: 4 KPI (termasuk Kekayaan bersih), tabel terbaru, panel perhatian, pengeluaran per kategori
  - Teks onboarding di bawah heading boleh diganti, tapi teks heading-nya tetap `Mulai kelola keuanganmu`.
  - Semua fitur Dashboard lama tetap ada (insight bulanan, dll).
- [ ] **Step 3:** Run build, lint, semua e2e. Expected: PASS.
- [ ] **Step 4:** Commit `feat(dashboard): design A home`.

### Task 6: Transaksi + form transaksi

**Files:** Modify `src/pages/Transactions.tsx`, `src/components/forms/TransactionForm.tsx`, `src/components/TransactionCard.tsx`.

- [ ] **Step 1:** Tambahkan e2e:
  - klik satu transaksi → `Sheet` detail dengan tombol `Edit` dan `Hapus`
  - Hapus → dialog konfirmasi → saldo akun kembali
  - di 1280 detail tampil sebagai panel kanan
  - Run, Expected: FAIL.
- [ ] **Step 2:** Implementasikan:
  - **List:** search, chip filter (Semua/Keluar/Masuk/Transfer), dan grup per hari dengan total harian. Tombol `Ekspor CSV` memanggil `exportCSV()` yang sudah ada di `src/lib/backup.ts`.
  - **Header:** chip `Terjadwal · n` → `?tab=recurring`.
  - **Tab recurring:** dirombak sesuai artboard "Transaksi terjadwal". Fungsi run/skip/deteksi tetap memakai fungsi yang sudah ada.
  - **Form:** `SegmentedControl` Keluar/Masuk/Transfer dan grid kategori. Field dan validasi zod tidak berubah.
  - **Split:** tetap memakai mekanisme split yang ada.
  - **Transfer:** pratinjau saldo sebelum→sesudah, dihitung dari `currentBalance`, tanpa biaya admin.
  - **Desktop:** form tampil sebagai modal.
- [ ] **Step 3:** Run build, lint, semua e2e. Expected: PASS.
- [ ] **Step 4:** Commit `feat(transactions): design A list, detail, form`.

### Task 7: Laporan, Buku besar, Anggaran

**Files:** Modify `src/pages/Reports.tsx`, `src/pages/Ledger.tsx`, `src/components/forms/BudgetForm.tsx`.

- [ ] **Step 1:** Tambahkan e2e: `/reports#anggaran` scroll ke section ber-`id="anggaran"` yang berisi progress anggaran; `?tab=ledger` tetap menampilkan buku besar. Run, Expected: FAIL pada anchor.
- [ ] **Step 2:** Implementasikan sesuai artboard "A — Laporan", "A — Buku besar", "A — Anggaran", dan versi desktopnya:
  - `SegmentedControl` Ringkasan/Buku besar (mengganti param `tab`)
  - kartu perbandingan bulan lalu, tingkat tabungan, bar per kategori
  - tabel ledger dengan saldo berjalan + Cetak + ekspor CSV (`handleExportCsv` yang sudah ada)
  - section anggaran dengan `ProgressBar` (≥100% `danger`, ≥80% `warning`)
  - Tombol `+ Atur` dan `Atur anggaran …` tetap memakai nama yang sama.
- [ ] **Step 3:** Run build, lint, e2e (`budgets.test.cjs` wajib PASS). Expected: PASS.
- [ ] **Step 4:** Commit `feat(reports): design A reports, ledger, budget`.

### Task 8: Hutang & piutang

**Files:** Modify `src/pages/Debts.tsx`.

- [ ] **Step 1:** Run e2e yang menyentuh debt (`walletData.test.cjs`) sebagai patokan.
- [ ] **Step 2:** Implementasikan sesuai artboard "A — Hutang & piutang", "Tambah hutang/piutang", "Bayar hutang", dan versi desktop:
  - mobile: `SegmentedControl` Hutang saya/Piutang saya; desktop: dua kolom
  - kartu dengan sisa/total + `ProgressBar`
  - aksi tambah dipindah ke `PageHeader`
  - form bayar di `Sheet`, dengan logika akun kartu kredit di baris 132–178 tetap utuh
  - `Riwayat` dan `Edit pembayaran` tetap memakai nama yang sama
- [ ] **Step 3:** Run build, lint, semua e2e. Expected: PASS.
- [ ] **Step 4:** Commit `feat(debts): design A debts`.

### Task 9: Aset & akun (hub) + Portofolio

**Files:** Modify `src/pages/Accounts.tsx`, `src/pages/Portfolio.tsx` (1343 baris; boleh dipecah ke `src/pages/portfolio/*.tsx` jika perlu, tanpa mengubah logika), `src/components/forms/AccountForm.tsx`.

- [ ] **Step 1:** Tambahkan e2e: `/accounts` menampilkan `Kekayaan bersih`, link `Hutang & piutang` dan `Portofolio`, dan ikon gerigi `Pengaturan`. `Cocokkan saldo <akun>` tetap jalan (`accountReconciliation.test.cjs`). Run, Expected: FAIL pada elemen baru.
- [ ] **Step 2:** Implementasikan Accounts sesuai artboard "A — Aset (hub)" / "A — Detail akun" / desktop "Aset & akun":
  - header kekayaan bersih dari `getNetWorth`, dengan catatan aset belum ada harga jika ada
  - bar alokasi
  - daftar akun aktif, detail akun, kartu rekonsiliasi, arsip
- [ ] **Step 3:** Implementasikan Portfolio sesuai artboard "A — Portofolio" / "Tambah aset" / desktop:
  - total, untung dari modal, alokasi, chip filter
  - tabel desktop (modal/nilai/untung/24j)
  - sinkron harga dan form tambah aset memakai fungsi yang ada
- [ ] **Step 4:** Run build, lint, semua e2e + `node --test tests/portfolioMetrics.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(accounts,portfolio): design A asset hub`.

### Task 10: Pengaturan & Kategori

**Files:** Modify `src/pages/Settings.tsx`, `src/pages/Categories.tsx`.

- [ ] **Step 1:** Implementasikan sesuai artboard "A — Pengaturan" / "A — Kategori" / desktop "Pengaturan":
  - grup Tampilan, Keamanan, Asisten AI, Backup, Zona bahaya memakai `ListGroup`/`ListRow`
  - restore Drive memakai `Sheet` dengan pilihan Gabungkan/Ganti semua, mengikuti mode yang sudah didukung `src/lib/backup.ts`
  - "Hapus semua data" tetap memakai dialog konfirmasi yang ada
  - tombol kembali → `/accounts`
- [ ] **Step 2:** Run build, lint, semua e2e (backup di `budgets.test.cjs`). Expected: PASS.
- [ ] **Step 3:** Commit `feat(settings): design A settings and categories`.

### Task 11: Kunci PIN & Chat AI

**Files:** Modify `src/components/LockScreen.tsx`, `src/components/chat/*.tsx`.

- [ ] **Step 1:** Restyle sesuai artboard "A — Kunci PIN" dan "A — Asisten AI":
  - PIN 6 titik, keypad 3×4 dengan tombol minimal 64px
  - kartu konfirmasi transaksi di chat
  - logika `usePinStore`, `aiGuard`, dan `aiClient` tidak disentuh
- [ ] **Step 2:** Run build, lint, `node --test tests/aiClient.test.ts`, `chatParser.test.cjs`. Expected: PASS.
- [ ] **Step 3:** Commit `feat(lock,chat): design A lock screen and chat`.

### Task 12: Beres-beres & mode gelap

**Files:** Modify `src/components/layout/AppLayout.tsx`, `src/App.tsx` (toast update).

- [ ] **Step 1:** Hapus FAB `pageAction` mobile. Semua aksi halaman sekarang ada di `PageHeader`; pastikan tidak ada halaman yang kehilangan aksinya. Toast update memakai gaya artboard "Konfirmasi hapus & toast".
- [ ] **Step 2:** Tambahkan e2e: aktifkan tema gelap dari Pengaturan, lalu pastikan `document.documentElement` punya class `dark` dan warna `body` sama dengan `hsl(220 35% 7%)`.
- [ ] **Step 3:** Run `grep -rnE "#[0-9A-Fa-f]{6}" src/pages src/components`. Expected: tidak ada hex baru (bandingkan dengan `git diff master`).
- [ ] **Step 4:** Run `git diff master --stat -- src/db src/services src/types`. Expected: kosong.
- [ ] **Step 5:** Jalankan regresi penuh seperti Task 0 Step 2–3. Expected: semua PASS dan sama dengan baseline.
- [ ] **Step 6:** Lakukan cek manual di HP (390px), tablet (768px), dan desktop (1280px), terang dan gelap, untuk alur catat, transfer, bayar hutang, rekonsiliasi, backup lalu restore.
- [ ] **Step 7:** Commit `chore: remove legacy FAB, dark mode pass`. Merge ke `master` hanya setelah review; deploy dilakukan terpisah dan manual.
