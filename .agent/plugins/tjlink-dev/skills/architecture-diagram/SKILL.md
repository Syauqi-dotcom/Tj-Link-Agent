---
name: architecture-diagram
description: Buat diagram arsitektur draw.io (.drawio) yang tervalidasi dari spesifikasi JSON, tanpa ketergantungan vendor cloud, lalu hasilkan tautan pratinjau app.diagrams.net. Gunakan saat diminta membuat, merancang, atau memvisualisasikan arsitektur sistem, alur kerja agent, atau pipeline.
argument-hint: "[jelaskan arsitektur atau alur yang ingin digambar]"
allowed-tools: Bash, Write, Read, Glob, Grep
license: Internal TJLINK
metadata:
  version: "0.3.0"
  owner: TJLINK Engineering
---

# Architecture Diagram (vendor-neutral)

Menghasilkan file `.drawio` dari spesifikasi JSON kecil. Kontrak berkasnya sama dengan skill
`aws-architecture-diagram` (XML tidak terkompresi, Helvetica, warna `light-dark()`, tanpa atribut
`background`, id unik, edge tervalidasi), tetapi memakai kotak generik, bukan ikon AWS.

## Workflow

1. **Tentukan isi.** Tanyakan atau simpulkan komponen, hubungan, dan urutan alur. Bila user meminta
   "analisis kode", baca struktur repo dulu (read-only); konfirmasi komponen yang ditemukan sebelum menggambar.
2. **Tulis spec** JSON ke `docs/<nama-deskriptif>.spec.json`. Format dan aturan tata letak:
   `references/spec-format.md`.
3. **Bangun + validasi:**

   ```bash
   python3 .agent/plugins/tjlink-dev/scripts/lib/diagram.py docs/<nama>.spec.json docs/<nama>.drawio
   ```

   Bila `VALIDASI GAGAL`, perbaiki spec (bukan XML) dan ulangi.
4. **Pratinjau** (hanya setelah validasi lolos):

   ```bash
   python3 .agent/plugins/tjlink-dev/scripts/lib/drawio_url.py docs/<nama>.drawio
   ```

   Tambah `--open` hanya bila user menginginkan browser dibuka.
5. **Sampaikan ke user:** path file, daftar komponen, status validasi, tautan pratinjau, dan alt text
   singkat (di bawah 100 karakter, menjelaskan tujuan diagram, bukan "diagram dari...").

## Aturan

- Nama berkas kebab-case dan deskriptif; selalu buat berkas baru kecuali user minta mengubah yang ada.
- Satu komponen = satu node; hindari menambah komponen yang tidak disebut user atau tidak ada di alur data.
- Diagram dengan 7+ langkah memakai `step` pada edge; legenda di sisi kanan dibuat otomatis.
- Jangan menulis XML tangan bila spec bisa mengekspresikannya.
- Jangan menaruh data sensitif (host internal, kredensial, IP produksi) di label.
