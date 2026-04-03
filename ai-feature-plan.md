# AI Feature Plan - Wallet

Updated: 2026-04-03
Owner: Product/Dev

## Goal
Menambahkan fitur AI yang benar-benar mempercepat input transaksi dan memberi insight/prediksi yang actionable, tanpa mengorbankan kontrol user pada mode manual.

## Scope
In scope:
- Predictive Budget Warning
- Recurring Transaction Detection
- Monthly Insight Summary
- Receipt Scan (OCR/vision)
- Anomaly Spending Detection

Out of scope (phase ini):
- Full server-side proxy AI key
- Cross-device sync
- Auto-save tanpa review user

## Implementation Steps
1. Phase 1 - Quick Wins
- Predictive Budget Warning (local-first)
- Anomaly Spending Detection (local-first)

2. Phase 2 - Core Intelligence
- Recurring Transaction Detection
- Monthly Insight Summary (AI narasi dari angka agregat)

3. Phase 3 - Differentiator
- Receipt Scan ke draft transaksi

4. Hardening
- Debounce/rate-limit request AI
- Online-only indicator
- Privacy warning di Settings

## Progress Tracker
- [x] Plan & flow disepakati (manual tetap ada, AI sebagai asisten)
- [x] Phase 1 - Predictive Budget Warning implemented
- [x] Phase 1 - Anomaly Spending Detection implemented
- [x] Phase 2 - Recurring Transaction Detection implemented
- [x] Phase 2 - Monthly Insight Summary implemented
- [x] Phase 3 - Receipt Scan implemented
- [x] Hardening complete
- [ ] QA manual + edge-case validation complete

## Current Progress
- Status: Phase 3 started, scan struk aktif ke draft review manual
- Overall progress: 95%
- Next recommended step: jalankan QA manual + edge-case validation menggunakan ai-qa-checklist.md.

## Progress Log
- 2026-03-29: Plan dibuat, flow tiap fitur dijelaskan, trigger background vs manual trigger dijelaskan, prioritas eksekusi ditetapkan.
- 2026-03-29: Predictive Budget Warning diimplementasikan (local-first) dengan estimasi hari habis budget dan proyeksi over budget di dashboard alert.
- 2026-04-03: Anomaly Spending Detection diimplementasikan secara local-first dengan membandingkan expense terbaru terhadap histori kategori yang sama, memakai minimum sampel dan threshold nominal agar alert tidak noisy. Hasil anomali ditampilkan di kartu Dashboard "Perlu Perhatian" untuk review manual user.
- 2026-04-03: Alert anomaly di-dashboard sekarang deep-link langsung ke transaksi yang terdeteksi dan membuka flow review dari halaman Transactions.
- 2026-04-03: Recurring Transaction Detection diimplementasikan secara local-first pada tab Transaksi Terjadwal. Sistem menganalisis pola income atau expense berulang dari histori transaksi, lalu memberi saran draft jadwal yang tetap harus direview dan disimpan manual oleh user.
- 2026-04-03: Monthly Insight Summary diimplementasikan pada halaman Reports. Insight memakai agregat laporan bulanan sebagai sumber fakta, mencoba membentuk narasi AI bila API key tersedia dan perangkat online, lalu fallback ke ringkasan lokal jika AI tidak tersedia.
- 2026-04-03: Receipt Scan diimplementasikan pada form AI transaction. User sekarang bisa upload atau foto struk, hasil scan Gemini vision diubah menjadi draft transaksi, lalu tetap masuk ke tahap review manual sebelum disimpan.
- 2026-04-03: Hardening selesai: request AI sekarang dibatasi rate-limit minimal per fitur untuk mencegah spam, indikator online-only ditambahkan pada flow AI, dan privacy warning eksplisit ditambahkan di halaman Settings.
- 2026-04-03: QA checklist manual + edge-case disiapkan di ai-qa-checklist.md untuk validasi end-to-end sebelum sign-off.

## Notes
- Prinsip utama: AI tidak pernah auto-save transaksi tanpa konfirmasi user.
- Manual mode tetap default dan full kontrol user.
- Fitur AI harus graceful-degrade saat offline (fallback ke local/manual).
