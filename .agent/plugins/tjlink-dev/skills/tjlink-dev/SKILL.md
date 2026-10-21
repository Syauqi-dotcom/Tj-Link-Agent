---
name: tjlink-dev
description: Playbook kerja AI developer TJLINK — alur 6 fase, larangan, kewajiban membaca kode dulu, testing, dan laporan berbasis evidence gate. Gunakan untuk setiap tugas yang membaca, mengubah, atau mereview kode di repo TJLINK/DABN.
license: Internal TJLINK
metadata:
  version: "0.3.0"
  owner: TJLINK Engineering
---

# TJLINK AI Developer Playbook

Playbook ini mengatur **cara kerja** agent agar disiplin, repeatable, aman, dan bisa diaudit.
Aturan inti yang selalu dimuat ada di `.agent/AGENTS.md`. Skill ini memuat detailnya dan dimuat
saat tugas menyentuh kode (progressive disclosure: hemat konteks).

Jika permintaan di prompt bertentangan dengan playbook ini dalam hal keamanan atau integritas
kode, **playbook ini menang**: berhenti dan minta konfirmasi manusia.

## Prinsip Inti

1. **Baca dulu, ubah kemudian.** Tidak ada perubahan sebelum membaca kode, pemanggil, dan test terkait.
2. **Perubahan minimal & terfokus.** Hanya yang diminta; tanpa refactor atau fitur tambahan.
3. **Selesai = terbukti.** Klaim selesai hanya bila gate final PASS dan evidence FRESH.
4. **Aman secara default.** Tanpa akses production, database, credential, atau deployment.
5. **Dapat diaudit.** Setiap tugas meninggalkan laporan + evidence yang bisa dicek ulang.

## Alur Kerja Wajib (6 fase)

| Fase | Nama | Aktivitas | Bukti |
| ---- | ---- | --------- | ----- |
| 1 | Understand | Pahami tujuan & kriteria sukses konkret | Tujuan di laporan |
| 2 | Explore | Baca file target, pemanggil, test, dokumentasi (MCP `tjlink-readonly`) | Daftar file dibaca / audit log MCP |
| 3 | Plan | Rencana singkat: file apa diubah & kenapa | Bagian "Perubahan" |
| 4 | Implement | Terapkan perubahan minimal | Diff git |
| 5 | Verify | `node .agent/plugins/tjlink-dev/scripts/verify-change.js --mode final` | `.agent/state/evidence/gate-final.json` |
| 6 | Report | Laporan format `references/report-format.md`, angka dari evidence | Laporan |

Tugas sepele boleh meringkas fase 2–3; fase 5–6 tetap wajib.

## Larangan (hard rules)

Tanpa konfirmasi eksplisit manusia, agent DILARANG:

- Mengubah/menghapus file di luar scope tugas, atau menghapus secara massal.
- Menyentuh production, infra live, pipeline deployment, atau database.
- Membaca, menyalin, atau menampilkan credential, secret, token, `.env`, private key.
- `git push`, `git reset --hard`, `git clean -f`, hapus branch, mengubah git config, `--no-verify`.
- Mengubah guardrail: `.agent/`, `.kiro/`, `.claude/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`,
  `githooks/`, `mcp/`, `lib/`, dan aturan lint.
- Mengirim kode/data ke endpoint pihak ketiga.

Guard PreToolUse menegakkan sebagian besar larangan ini (exit 2 = diblokir). Jika diblokir,
**jangan mencari jalan pintas**: jelaskan risiko dan alternatif non-destruktif ke manusia.

## Kewajiban Membaca Existing Code

Sebelum mengubah file apa pun:

1. Baca file target (utuh, atau bagian relevan untuk file besar).
2. Cari pemanggil/pengguna fungsi yang akan diubah.
3. Baca test terkait sebagai kontrak perilaku.
4. Periksa dokumentasi terkait (MCP `tjlink-readonly` bila tersedia).

Klaim tentang kode yang belum dibaca dilarang. Hal yang belum terverifikasi ditulis eksplisit di
bagian "Risiko & Asumsi" laporan.

## Testing

- Fitur baru/bug fix wajib di-cover test. Gate memetakan **test terkait** dari `require()`;
  file `src/` yang berubah tanpa test pengcover membuat gate **FAIL**.
- Test harus deterministik: tanpa jaringan, waktu nyata, atau sistem eksternal.
- Mode `final` (lokal) menjalankan test terkait; mode `ci` (pre-commit/CI) seluruh suite.
- Bersihkan artefak sementara yang dibuat selama verifikasi.

## Aturan Keras Status

- `✅ SELESAI` hanya bila `overall = PASS` **dan**
  `node .agent/plugins/tjlink-dev/scripts/verify-change.js --verify-evidence` = FRESH.
- Gate FAIL atau evidence STALE berarti `⛔ BELUM SELESAI`. Tanpa pengecualian.
- Angka verifikasi di laporan disalin dari evidence, bukan dari ingatan atau perkiraan.

## References

- `references/coding-rules.md` — gaya kode, dependency, larangan `console.log`/`TODO`, validasi input.
- `references/report-format.md` — template laporan wajib (6 bagian).
- `references/enforcement-map.md` — peta lapis penegakan: instruksi vs hook vs MCP vs CI.
