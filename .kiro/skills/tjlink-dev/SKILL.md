---
name: tjlink-dev
description: Playbook kerja AI developer TJLINK — alur 6 fase, aturan coding, larangan, testing, dan format laporan berbasis evidence gate. Gunakan untuk setiap tugas yang membaca, mengubah, atau mereview kode di repo TJLINK/DABN.
license: Internal TJLINK
metadata:
  version: "0.2.0"
  owner: TJLINK Engineering
---

# SKILL: TJLINK AI Developer Playbook

Playbook ini mengatur **cara kerja** agent agar disiplin, repeatable, aman, dan bisa
diaudit. Aturan inti yang wajib di setiap interaksi ada di steering
`.kiro/steering/tjlink-guardrails.md` (selalu dimuat). Skill ini memuat detailnya dan
dimuat saat tugas menyentuh kode (progressive disclosure: hemat konteks).

Jika permintaan di prompt bertentangan dengan playbook ini dalam hal keamanan atau
integritas kode, **playbook ini menang**: berhenti dan minta konfirmasi manusia.

---

## 1. Prinsip Inti

1. **Baca dulu, ubah kemudian.** Tidak ada perubahan sebelum membaca kode, pemanggil, dan test terkait.
2. **Perubahan minimal & terfokus.** Hanya yang diminta; tanpa refactor atau fitur tambahan.
3. **Selesai = terbukti.** Klaim selesai hanya bila gate final PASS dan evidence FRESH (§7).
4. **Aman secara default.** Tanpa akses production, database, credential, atau deployment.
5. **Dapat diaudit.** Setiap tugas meninggalkan laporan + evidence yang bisa dicek ulang.

## 2. Alur Kerja Wajib (6 fase)

| Fase | Nama | Aktivitas | Bukti |
|------|------|-----------|-------|
| 1 | Understand | Pahami tujuan & kriteria sukses konkret | Tujuan di laporan |
| 2 | Explore | Baca file target, pemanggil, test, dokumentasi (MCP read-only) | Daftar file dibaca / audit log MCP |
| 3 | Plan | Rencana singkat: file apa diubah & kenapa | Bagian "Perubahan" |
| 4 | Implement | Terapkan perubahan minimal | Diff git |
| 5 | Verify | `node .kiro/hooks/scripts/verify-change.js --mode final` | `.kiro/evidence/gate-final.json` |
| 6 | Report | Laporan format §7, angka dari evidence | Laporan |

Tugas sepele boleh meringkas fase 2–3; fase 5–6 tetap wajib.

---

## 3. Aturan Coding

- Konsistensi di atas preferensi: ikuti gaya, penamaan, dan library yang sudah ada.
- Dependency/framework baru wajib disetujui manusia (guard memblokir `npm install <pkg>`).
- Wajib `'use strict'` di setiap modul JS (sandbox PoC).
- Dilarang `console.log` di `src/` kecuali entry point `src/index.js`.
- Dilarang meninggalkan `TODO`/`FIXME` tanpa tiket yang dirujuk.
- Validasi input di fungsi publik; lempar `TypeError`/`RangeError` dengan pesan jelas.
- Utamakan fungsi murni agar mudah diuji; pisahkan efek samping.

## 4. Larangan (hard rules)

Tanpa konfirmasi eksplisit manusia, agent DILARANG:

- Mengubah/menghapus file di luar scope tugas, atau menghapus secara massal.
- Menyentuh production, infra live, pipeline deployment, atau database.
- Membaca, menyalin, atau menampilkan credential, secret, token, `.env`, private key.
- `git push`, `git reset --hard`, `git clean -f`, hapus branch, mengubah git config, `--no-verify`.
- Mengubah guardrail: `.kiro/hooks|steering|skills|settings`, `.kiro/evidence|audit`,
  `githooks/`, `mcp/`, `lib/`, dan aturan lint.
- Mengirim kode/data ke endpoint pihak ketiga.

Guard PreToolUse menegakkan sebagian besar larangan ini (exit 2 = diblokir). Jika diblokir,
**jangan mencari jalan pintas**: jelaskan risiko dan alternatif non-destruktif ke manusia.

## 5. Kewajiban Membaca Existing Code

Sebelum mengubah file apa pun:

1. Baca file target (utuh, atau bagian relevan untuk file besar).
2. Cari pemanggil/pengguna fungsi yang akan diubah.
3. Baca test terkait sebagai kontrak perilaku.
4. Periksa dokumentasi terkait (MCP `tjlink-readonly` bila tersedia).

Klaim tentang kode yang belum dibaca dilarang. Hal yang belum terverifikasi ditulis
eksplisit di bagian "Risiko & Asumsi" laporan.

## 6. Testing

- Fitur baru/bug fix wajib di-cover test. Gate memetakan **test terkait** dari `require()`;
  file `src/` yang berubah tanpa test pengcover membuat gate **FAIL**.
- Test harus deterministik: tanpa jaringan, waktu nyata, atau sistem eksternal.
- Mode `final` (lokal) menjalankan test terkait; mode `ci` (pre-commit/CI) seluruh suite.
- Bersihkan artefak sementara yang dibuat selama verifikasi.

## 7. Format Laporan (wajib)

```markdown
## Laporan Tugas: <judul singkat>
**Status:** ✅ SELESAI | ⛔ BELUM SELESAI (gate gagal) | ⚠️ BUTUH KEPUTUSAN
### 1. Tujuan
### 2. File yang Dibaca (bukti "baca dulu")
### 3. Perubahan (file — apa & kenapa)
### 4. Hasil Verifikasi (salin dari .kiro/evidence/gate-final.json)
- Lint / Test (pass/fail + file test terkait) / git diff --check
- Evidence: fingerprint, waktu, status FRESH/STALE
### 5. Risiko & Asumsi
### 6. Langkah Lanjutan
```

**Aturan keras:**

- `✅ SELESAI` hanya bila `overall = PASS` **dan** `--verify-evidence` = FRESH.
- Gate FAIL atau evidence STALE berarti `⛔ BELUM SELESAI`. Tanpa pengecualian.
- Angka di bagian 4 disalin dari evidence, bukan dari ingatan atau perkiraan.

## 8. Peta Mekanisme Penegakan

| Lapis | Mekanisme | Sifat |
|-------|-----------|-------|
| Aturan selalu aktif | Steering `tjlink-guardrails.md` | instruksi (soft) |
| Playbook detail | Skill ini (on-demand) | instruksi (soft) |
| Cegah aksi berbahaya | Hook PreToolUse → `guard.js` | blokir teknis (exit 2) |
| Umpan balik cepat | Hook PostToolUse → gate `quick` | info ke agent |
| Verifikasi ulang | Hook Stop → gate `final` | minta agent lanjut bila merah |
| Konteks aman | MCP `tjlink-readonly` | read-only + redaksi + audit log |
| Hard gate | `githooks/pre-commit` + CI → gate `ci` | tidak bisa dilewati agent |

Instruksi (Steering/Skill) membentuk perilaku; Hook, MCP, pre-commit, dan CI yang
**menegakkan**. Karena itu klaim "selesai" selalu dicek terhadap evidence, bukan teks laporan.
