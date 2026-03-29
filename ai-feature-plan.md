# AI Feature Plan - Wallet

Updated: 2026-03-29
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
- [ ] Phase 1 - Anomaly Spending Detection implemented
- [ ] Phase 2 - Recurring Transaction Detection implemented
- [ ] Phase 2 - Monthly Insight Summary implemented
- [ ] Phase 3 - Receipt Scan implemented
- [ ] Hardening complete
- [ ] QA manual + edge-case validation complete

## Current Progress
- Status: Phase 1 started, Predictive Budget Warning implemented
- Overall progress: 30%
- Next recommended step: lanjut implement Anomaly Spending Detection agar Phase 1 selesai.

## Progress Log
- 2026-03-29: Plan dibuat, flow tiap fitur dijelaskan, trigger background vs manual trigger dijelaskan, prioritas eksekusi ditetapkan.
- 2026-03-29: Predictive Budget Warning diimplementasikan (local-first) dengan estimasi hari habis budget dan proyeksi over budget di dashboard alert.

## Notes
- Prinsip utama: AI tidak pernah auto-save transaksi tanpa konfirmasi user.
- Manual mode tetap default dan full kontrol user.
- Fitur AI harus graceful-degrade saat offline (fallback ke local/manual).
