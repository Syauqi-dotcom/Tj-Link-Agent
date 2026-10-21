# PoC — TJLINK Agentic Development Workflow (v0.2)

PoC ini menunjukkan AI coding agent yang bekerja dengan **aturan konsisten** dan
**pengecekan otomatis yang tidak bisa diakali**, bukan sekadar coding dari prompt.
Fokusnya: agent yang **disiplin, repeatable, aman, dan bisa diaudit**.

Status: PoC untuk direview. Belum terintegrasi ke DABN production.

## Komponen

| Komponen | Peran | Lokasi |
|----------|-------|--------|
| Steering (always) | Aturan inti yang selalu dimuat di setiap interaksi | `.kiro/steering/tjlink-guardrails.md` |
| Skill (on-demand) | Playbook kerja detail AI developer TJLINK | `.kiro/skills/tjlink-dev/SKILL.md` |
| Hook PreToolUse | Guard: blokir aksi berbahaya sebelum terjadi | `.kiro/hooks/tjlink-guard.json` |
| Hook PostToolUse | Quick-check lint untuk file yang baru diedit | `.kiro/hooks/tjlink-quick-check.json` |
| Hook Stop | Gate final ulang; minta agent lanjut bila merah | `.kiro/hooks/tjlink-final-gate.json` |
| Gate | Satu skrip: lint, test terkait, `git diff --check`, evidence | `.kiro/hooks/scripts/verify-change.js` |
| MCP read-only | Akses repo/docs terstruktur: allowlist, redaksi, audit log | `mcp/tjlink-readonly-server.js` |
| Hard gate | Pre-commit lokal (CI memakai gate yang sama) | `githooks/pre-commit` |
| Self-test | 76 asersi yang membuktikan klaim di atas | `scripts/selftest.js` |

Arsitektur, alur, dan rekomendasi: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Skrip rekam video: [docs/DEMO-GUIDE.md](docs/DEMO-GUIDE.md).

## Prasyarat

Node.js 18+ (diuji v22.14.0) dan Git (diuji 2.48). Tidak perlu `npm install` (zero-dependency).

## Menjalankan (dari root repo)

```powershell
node scripts/selftest.js                                  # 76 asersi: gate, guard, MCP, demo, pre-commit, config
node demo/run-demo.js                                     # demo end-to-end skenario hijau -> ✅ SELESAI
node demo/run-demo.js --scenario red                      # skenario bug -> gate merah -> ⛔ BELUM SELESAI
node .kiro/hooks/scripts/verify-change.js --mode final    # gate manual (lint + test terkait + diff check)
node .kiro/hooks/scripts/verify-change.js --verify-evidence   # evidence masih cocok dengan kode?
```

Demo dan self-test tidak mengubah git index; sandbox dipulihkan otomatis. Laporan demo ada di
`demo/output/REPORT-<skenario>.md`.

## Mengaktifkan di Kiro IDE

1. **Steering, Skill, Hook** sudah berupa file di `.kiro/` dan aktif saat **sesi baru** dimulai
   (Kiro IDE 1.0+, format hook `.kiro/hooks/*.json` v1).
2. **MCP**: jalankan `node mcp/print-config.js`, lalu salin hasilnya ke `.kiro/settings/mcp.json`.
   Path dibuat absolut karena dokumentasi Kiro tidak menjamin working directory server MCP.
3. **Hard gate lokal** (sekali per clone, oleh manusia): `git config core.hooksPath githooks`.
4. **Baseline commit** dianjurkan. Dengan HEAD, gate memilih *test terkait* dan memeriksa
   cakupan test. Tanpa HEAD (kondisi repo saat ini), gate menjalankan seluruh suite.

## Jaminan keamanan PoC

- Tidak ada akses production, database, credential, atau deployment.
- MCP hanya 4 tool read-only (`readOnlyHint`): allowlist folder/ekstensi, menolak symlink/junction,
  redaksi secret, audit log tanpa isi file.
- Guard memblokir perintah berisiko dan perubahan guardrail (anti-tamper), fail-closed.
- Klaim "selesai" harus didukung evidence `PASS` + `FRESH`; pre-commit/CI menolak kode merah.

## Status verifikasi

| Hal | Status |
|-----|--------|
| Logika gate, guard, MCP, demo, pre-commit, konfigurasi | Terverifikasi otomatis: `scripts/selftest.js` 76/76 |
| Interop MCP dengan client resmi `@modelcontextprotocol/sdk@1.32.1` | Terverifikasi 8/8 |
| Hook benar-benar terpicu di Kiro IDE | **Belum**: perlu sesi baru, checklist di DEMO-GUIDE |
| Nama field payload stdin tool tulis/shell | Sebagian terdokumentasi; guard parsing defensif + fail-closed |

## Peta deliverable

| Permintaan | Deliverable |
|-----------|-------------|
| Contoh SKILL.md | `.kiro/skills/tjlink-dev/SKILL.md` (+ steering always-on) |
| Hook otomatis | `.kiro/hooks/*.json`, `.kiro/hooks/scripts/`, `githooks/pre-commit` |
| MCP read-only | `mcp/tjlink-readonly-server.js`, `mcp/mcp.example.json`, `mcp/print-config.js` |
| Demo end-to-end | `demo/` (skenario green & red) |
| Arsitektur & rekomendasi | `docs/ARCHITECTURE.md` |
| Video demo | Skrip rekaman: `docs/DEMO-GUIDE.md` (rekaman dibuat manual) |
