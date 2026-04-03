# AI QA Checklist - Wallet

Updated: 2026-04-03
Scope: Validasi manual + edge-case untuk semua fitur AI setelah hardening.

## Prasyarat
- Build sukses (`npm run build`)
- Ada minimal 2 akun aktif
- Ada kategori income + expense
- Gemini API key valid (untuk skenario online)

## Ringkasan Status
- [ ] Sesi 1: Online happy path
- [ ] Sesi 2: Offline fallback path
- [ ] Sesi 3: Rate-limit behavior
- [ ] Sesi 4: Data integrity (manual review only)

## 1) AI Text Parse (Dashboard)
### Happy path
- [ ] Buka AI input mode `Teks`.
- [ ] Input: "Makan siang 45rb pakai BCA hari ini".
- [ ] Klik parse.
- [ ] Muncul review transaksi dengan amount, date, account, category masuk akal.
- [ ] Edit satu field lalu simpan.
- [ ] Cek transaksi tersimpan sesuai review akhir.

Expected:
- Tidak ada auto-save sebelum tombol simpan.
- Error state kosong saat input valid.

### Edge cases
- [ ] Input kosong.
- [ ] API key kosong.
- [ ] Input campur beberapa transaksi dalam satu kalimat.
- [ ] Input ambigu (tanpa tanggal, tanpa akun jelas).

Expected:
- Muncul pesan error yang informatif untuk input kosong/API key kosong.
- Fallback account/date default tetap valid.

## 2) Receipt Scan (Dashboard)
### Happy path
- [ ] Buka AI input mode `Scan Struk`.
- [ ] Upload/foto struk yang jelas (total + tanggal terlihat).
- [ ] Klik scan.
- [ ] Review transaksi muncul.
- [ ] Simpan.
- [ ] Verifikasi transaksi tersimpan benar.

Expected:
- Preview gambar tampil.
- Hasil tetap masuk review manual sebelum simpan.

### Edge cases
- [ ] Upload gambar blur/gelap.
- [ ] Upload gambar non-struk (random photo).
- [ ] Struk tanpa tanggal jelas.
- [ ] Struk dengan beberapa nominal (subtotal, pajak, total).

Expected:
- Jika gagal parse: error jelas dan tidak crash.
- Jika tanggal tak terbaca: default ke hari ini.
- Total utama diprioritaskan.

## 3) Monthly Insight Summary (Reports)
### Happy path
- [ ] Buka Reports mode bulanan.
- [ ] Pastikan kartu insight muncul.
- [ ] Cek label source (`AI` atau `Lokal`) sesuai kondisi.
- [ ] Cek nominal tampil ringkas (`2,5jt`, `850rb`, dst).

Expected:
- Narasi konsisten dengan summary angka.
- Tidak ada angka aneh atau kosong pada highlight.

### Edge cases
- [ ] Bulan tanpa transaksi.
- [ ] Bulan dengan transaksi tapi tanpa budget.
- [ ] Pindah bulan cepat (prev/next berulang).

Expected:
- Insight fallback lokal tetap informatif.
- Tidak memicu error UI saat navigasi cepat.

## 4) Recurring Detection Suggestion (Transactions)
### Happy path
- [ ] Buka tab transaksi terjadwal.
- [ ] Pastikan kartu saran recurring tampil jika data historis cukup.
- [ ] Klik `Buat jadwal` dari satu saran.
- [ ] Cek draft recurring form terisi sesuai saran.
- [ ] Simpan jadwal.

Expected:
- Draft terisi benar (amount, interval, date, note, account).
- Jadwal baru muncul di daftar recurring.

### Edge cases
- [ ] Data historis tidak cukup.
- [ ] Sudah ada recurring mirip.

Expected:
- Saran tidak muncul (atau berkurang) secara wajar.

## 5) Hardening Checks
### Online-only indicator
- [ ] Matikan internet.
- [ ] Buka AI form + Settings.
- [ ] Cek status tampil `Offline`.
- [ ] Coba parse/scan saat offline.

Expected:
- Tombol aksi AI nonaktif di form.
- Error offline jelas jika request dipicu dari kode path lain.

### Rate-limit
- [ ] Klik parse AI berulang cepat (< 2-3 detik).
- [ ] Klik scan struk berulang cepat.
- [ ] Trigger insight bulanan berulang dengan input sama.

Expected:
- Muncul pesan throttling (`Permintaan AI terlalu cepat...`) untuk parse/scan.
- Insight tidak menembak endpoint berulang untuk input identik.

### Privacy warning
- [ ] Buka Settings, section Gemini AI.
- [ ] Cek warning privasi tampil penuh.

Expected:
- Ada peringatan bahwa data diproses Google Gemini.
- Ada larangan kirim data sensitif.

## 6) Data Integrity Regression
- [ ] Setelah seluruh skenario, cek transaksi, balance akun, dan laporan.
- [ ] Verifikasi tidak ada transaksi duplikat tak disengaja.
- [ ] Verifikasi edit/delete transaksi tetap normal.

Expected:
- Semua mutasi tetap via flow review/simpan manual.
- Recalculate balance tetap konsisten.

## 7) Sign-off
- [ ] Semua critical path lolos
- [ ] Semua edge-case utama lolos
- [ ] Tidak ada bug blocker
- [ ] Siap tandai `QA manual + edge-case validation complete`

Notes bug/temuan:
- 
- 
- 
