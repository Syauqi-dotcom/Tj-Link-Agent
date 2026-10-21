# Format Laporan (wajib)

```markdown
## Laporan Tugas: <judul singkat>
**Status:** ✅ SELESAI | ⛔ BELUM SELESAI (gate gagal) | ⚠️ BUTUH KEPUTUSAN
### 1. Tujuan
### 2. File yang Dibaca (bukti "baca dulu")
### 3. Perubahan (file — apa & kenapa)
### 4. Hasil Verifikasi (salin dari .agent/state/evidence/gate-final.json)
- Lint / Test (pass/fail + file test terkait) / git diff --check
- Evidence: fingerprint, waktu, status FRESH/STALE
### 5. Risiko & Asumsi
### 6. Langkah Lanjutan
```

Aturan keras:

- `✅ SELESAI` hanya bila `overall = PASS` **dan** `--verify-evidence` = FRESH.
- Gate FAIL atau evidence STALE berarti `⛔ BELUM SELESAI`. Tanpa pengecualian.
- Angka di bagian 4 disalin dari evidence, bukan dari ingatan atau perkiraan.
