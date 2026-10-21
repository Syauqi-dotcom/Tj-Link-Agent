---
inclusion: always
---

# TJLINK Guardrails (selalu aktif)

Aturan inti untuk SEMUA tugas di workspace ini. Detail cara kerja ada di skill
`tjlink-dev` — aktifkan skill itu untuk setiap tugas yang membaca atau mengubah kode.

## Tidak bisa ditawar

- Baca dulu sebelum mengubah: file target, pemanggilnya, dan test terkait.
- Perubahan minimal sesuai task. Tanpa refactor atau fitur di luar permintaan.
- Dilarang: menyentuh production, database, credential/secret, deployment, `git push`,
  `git reset --hard`, `git clean -f`, mengubah git config, `--no-verify`, serta mengubah
  `.kiro/hooks|steering|skills|settings`, `githooks/`, `mcp/`, `lib/`.
- Guard PreToolUse memblokir aksi di atas (exit 2). Jangan mencari jalan pintas;
  jelaskan kebutuhan dan risikonya ke manusia.
- Ambil konteks repo/dokumentasi lewat MCP `tjlink-readonly` (read-only) bila tersedia.

## Definition of Done (berbasis bukti)

1. Jalankan `node .kiro/hooks/scripts/verify-change.js --mode final`.
2. `✅ SELESAI` hanya bila output `TJLINK gate (final) = PASS` **dan**
   `node .kiro/hooks/scripts/verify-change.js --verify-evidence` menyatakan FRESH.
3. Gate FAIL atau evidence STALE: status `⛔ BELUM SELESAI`, sertakan detail kegagalan.
4. Tutup dengan laporan format skill `tjlink-dev` §7. Angka verifikasi disalin dari
   `.kiro/evidence/gate-final.json`, bukan dari ingatan.

## Otomasi yang berjalan

- PostToolUse: quick-check per file yang diedit (hasilnya masuk ke konteks Anda).
- Stop: gate final dijalankan ulang secara independen; bila merah, Anda diminta lanjut.
- Pre-commit & CI: gate mode `ci` (seluruh test) — tidak bisa dilewati agent.
