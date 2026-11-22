# Design A Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen on branch `revamp-a` match its design A artboard. The first revamp kept old page structures and only changed colors.

**Architecture:** Same UI-only rules as `2026-11-21-wallet-revamp-a.md`. Each task names the artboards it must match. Implementers open the artboard HTML and copy its structure, spacing, hierarchy and copy, while wiring real data and existing handlers.

**Tech Stack:** React 19, Tailwind v4 tokens (`src/index.css`), primitives in `src/components/ui/index.tsx`, Playwright e2e via `node:test`.

**Spec:** Design canvas https://claude.ai/artifact/TDKFe9qFVx9DUVaQF33Dmd. Artboard sources are copied to `.superpowers/sdd/2026-11-22-design-a-parity/artboards/*.dc.html`. Each file is plain HTML with inline styles: the markup inside `<x-dc>` is the layout, and `renderVals()` holds sample data. Mismatch audit screenshots are in `.superpowers/sdd/2026-11-22-design-a-parity/audit/shots/`.

## Global Constraints

All Global Constraints of `docs/superpowers/plans/2026-11-21-wallet-revamp-a.md` still apply. They include:
- no changes to `src/db`, `src/services` or `src/types`;
- tokens only, no new hex;
- touch targets ≥44px;
- protected accessible names;
- no elements without app data (no bell, no time-of-day, no admin fee, no installment count, no credit limit, no ⌘ shortcuts, no "Ikuti sistem", no undo toast);
- money shown with tabular-nums and the existing formatters.

Additional rules for this plan:
- **Sample numbers.** Artboard numbers are samples. Never hardcode them.
- **Where features live.** A feature the artboard does not show moves to where the design implies, or into a secondary place (sheet, overflow menu, collapsible). It is never deleted. Data that is already shown on another page may be dropped from a page.
- **Category and account icons.** They render as a tinted square tile with 1–2 letter initials, using the entity's `color` for tint and text (shared `IconTile` primitive). The emoji `icon` field stays editable in the forms.
- **Dialogs.** Every dialog title is sentence case. Every destructive confirmation uses the shared centered `ConfirmDialog`, matching `A-Hapus.dc.html`.
- **e2e baseline.** It is unchanged:
  - `budgets.test.cjs` fails only at :121 ('50.000' vs '150.000').
  - `chatParser.test.cjs` fails only with TypeError reading 'content'.
  - Everything else passes.
  - Tests may be updated when an accessible name changes because the design requires it. The change must be stated in the report.

## Review Focus

1. Mobile overlays: no dialog, sheet or modal may sit under the bottom nav.
2. Every existing action stays reachable after rows lose their inline icons.
3. Hidden-balance mode keeps masking every amount in the new layouts.
4. Empty data on each redesigned page shows a designed empty state, not "Rp 0" screens.
5. Long names and large numbers truncate gracefully at 360px with no horizontal overflow.

---

### Task P1: Overlay fix, dialogs, IconTile
**Artboards:** A-Hapus, A-Restore, A-BayarHutang (sheet chrome), A-Kategori (tiles).
**Files:** `src/components/ui/index.tsx`, `src/components/layout/*`, every existing delete-confirm call site.
- [ ] Fix the stacking so Modal and Sheet always cover the mobile bottom nav. Add an e2e at 390px: open the add form; the `Simpan` button and the dialog's bottom edge are not covered by the nav (`elementFromPoint` at the button center returns the button).
- [ ] `Modal` gets the Sheet visual language: bottom sheet below lg, centered at lg, grab handle, sentence-case titles. All call-site titles become sentence case.
- [ ] Add `ConfirmDialog({ open, title, description, confirmLabel, tone: "danger", onConfirm, onClose })`, a centered `role="alertdialog"` with a tinted icon tile, matching A-Hapus. Use it for every delete or destructive confirmation (transactions, accounts, debts, payments, assets, categories, recurring, delete-all). The description names the item and, for transactions, the amount and the balance effect.
- [ ] Add `IconTile({ label, color, size })`, which renders initials tinted from color. Use it for every category and account avatar app-wide.

### Task P2: Transaction form
**Artboards:** A-Tambah, A-Transfer, A-Split, D-Tambah.
**Files:** `src/components/forms/TransactionForm.tsx`, `src/components/forms/AITransactionForm.tsx` (entry link only).
- [ ] Header: "Catat transaksi" with the close button on the left. Then the segmented control.
- [ ] Big centered formatted amount "Rp 45.000" (input) with the hint "Ketik 45rb atau 1,2jt", using the existing parser if there is one; otherwise digits only.
- [ ] Category grid: 4 columns of compact IconTile tiles.
- [ ] Akun / Tanggal / Catatan as list rows inside one card. Akun opens a picker sheet of IconTile account rows; Tanggal uses a native date input styled as a row value.
- [ ] A "Pakai AI" link that opens the existing AI form.
- [ ] Split and Simpan buttons sticky at the bottom. The Split view matches A-Split.
- [ ] Transfer matches A-Transfer: Dari and Ke cards with before→after balances and a swap button.
- [ ] Desktop: a 640px two-column modal (form left, category grid right, footer Split + "Simpan").
- [ ] Logic, validation and payloads unchanged. Keep the stored-default and cold-open behaviour (commit cc5b7b9) and the existing e2e.

### Task P3: Debt, account and asset forms; Debts page
**Artboards:** A-BayarHutang, A-TambahHutang, A-Hutang, D-Hutang, A-TambahAkun, A-TambahAset.
**Files:** `src/pages/Debts.tsx`, `src/components/forms/AccountForm.tsx`, `src/pages/Portfolio.tsx` (asset form part).
- [ ] Debts page: back button to `/accounts` and a "+" icon add button in the header. Cards have no inline edit or delete icons; Edit and Hapus move into the Riwayat sheet, which keeps the names `Edit pembayaran` / `Riwayat`.
- [ ] Bayar sheet matches A-BayarHutang: big amount, chips "Sebagian / Lunasi / Nominal lain", rows "Bayar dari / Tanggal", note line, "Catat pembayaran". Field labels stay as accessible names.
- [ ] Tambah hutang matches A-TambahHutang.
- [ ] AccountForm matches A-TambahAkun (type tiles, name/balance card, color swatches).
- [ ] Asset form matches A-TambahAset (type chips, search, field rows, preview card).

### Task P4: Budget page and compact Reports
**Artboards:** A-Anggaran, D-Anggaran, A-Laporan, D-Laporan, A-Ledger, D-Ledger.
**Files:** new `src/pages/Budgets.tsx`, `src/App.tsx` (route `/budgets`), `src/pages/Reports.tsx`, `src/pages/Ledger.tsx`, Sidebar, `src/lib/attention.ts` hrefs (the `href` string only), tests.
- [ ] Move the budget section and BudgetForm flow into `/budgets`, matching A-Anggaran / D-Anggaran. Header back to /reports on mobile; total card; IconTile rows with ProgressBar; "Ulangi tiap bulan" Switch; carry-forward. Keep `+ Atur` and `Atur anggaran <kategori>`.
- [ ] Reports gets a link card "Anggaran" → /budgets. Sidebar "Anggaran" → /budgets. Attention budget href → /budgets. `/reports#anggaran` navigates to /budgets (replace).
- [ ] Reports Ringkasan matches A-Laporan / D-Laporan:
  - Month switcher, then 3 summary cards with deltas, savings ring with YTD, category bars, 6-month chart.
  - Keep Insight, as a card after the chart.
  - Move Rentang mode into a small "Periode" control next to the month label.
  - Drop the donut (duplicates the bars) and "Saldo per akun" (shown on Aset).
- [ ] Ledger header: the title never truncates; Ekspor/Cetak become icon buttons with labels on mobile.
- [ ] Update `tests/budgets.test.cjs` navigation from /reports to /budgets only where needed. The pre-existing :121 failure stays at the same assertion.

### Task P5: Home, Transactions list, Scheduled, empty states
**Artboards:** Main, A-Desktop, A-Transaksi, D-Transaksi, A-DetailTrx, A-Terjadwal, A-Kosong, A-Onboarding.
**Files:** `src/pages/Dashboard.tsx`, `src/pages/Transactions.tsx`, `src/components/TransactionCard.tsx`, layout (desktop page action on Dashboard).
- [ ] Home matches Main and A-Desktop: header (date, title, eye button, overflow "…" menu), Total saldo, month card, Perlu perhatian, Terbaru.
  - The quick-action chips move into the "…" menu: Pengeluaran, Pemasukan, Transfer, Input AI/Struk, Chat AI. The `Chat AI` button name stays reachable.
  - Remove "Pengeluaran <bulan>" (it is in Reports) and "Akun aktif" (it is in Aset).
  - Merge "Peringatan dan tagihan" into Perlu perhatian. The budget prediction "Estimasi habis n hari lagi" becomes the detail text.
  - Desktop: remove the duplicate top-right "Tambah transaksi" (the sidebar has it), and show Keluar in neutral color.
- [ ] Transaction rows have no inline edit or delete icons on mobile; tapping a row opens detail.
  - Desktop table keeps `Edit <nama>` / `Hapus <nama>`, visible on row hover/focus (protected names; walletData uses them).
  - Rows use IconTile. The "Terjadwal · n" pill and Riwayat match A-Transaksi.
- [ ] Scheduled tab matches A-Terjadwal: detected-pattern card, date-block rows, `Jalankan sekarang` / `Lewati` buttons. "Tambah jadwal" is a "+" in the header.
- [ ] Empty states: Transactions empty matches A-Kosong. First-run Home matches A-Onboarding: 3 steps plus "Pulihkan dari backup" → Settings restore, keeping the heading `Mulai kelola keuanganmu`.

### Task P6: Assets, Portfolio, Settings, Categories
**Artboards:** A-Aset, A-Akun, D-Aset, A-Portofolio, D-Portofolio, A-Pengaturan, D-Pengaturan, A-Kategori.
**Files:** `src/pages/Accounts.tsx`, `src/pages/Portfolio.tsx`, `src/pages/Settings.tsx`, `src/pages/Categories.tsx`.
- [ ] Aset: IconTile avatars in account color; net-worth breakdown never truncates (wrap or shorter "jt" format via the existing formatter).
- [ ] Portfolio:
  - Header: back, title, sync icon with time, and "+" icon.
  - Summary card holds the allocation bar and legend.
  - Filter chips.
  - Compact asset rows (symbol tile, name, qty, value, 24h change). Details/edit/history open in a Sheet on row tap.
  - Desktop table per D-Portofolio.
  - The sync result shows as a dismissible inline banner, not a floating overlay.
- [ ] Settings matches A-Pengaturan / D-Pengaturan: compact rows with value + chevron.
  - API key, Privasi AI, Google Drive, Backup otomatis, Backup lokal and PIN each open a Sheet holding the existing controls.
  - Hapus semua uses ConfirmDialog.
- [ ] Kategori: "+" icon button in the header; the "Pulihkan default" action goes into a "…" menu.

### Task P7: Verify
- [ ] Re-run the audit capture script (`.superpowers/sdd/2026-11-22-design-a-parity/audit/capture.cjs`, output to a new folder) and compare each shot to its artboard.
- [ ] Run all gates; check no overflow at 360px.
