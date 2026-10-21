# Task Card Demo — PoC TJLINK

**ID:** TJL-DEMO-001
**Judul:** Terapkan PPN 11% pada perhitungan total invoice
**Prioritas:** Kecil (cocok untuk demo alur)

## Deskripsi
Saat ini `calculateTotal(items)` di `sandbox/src/pricing.js` hanya mengembalikan
subtotal (PPN belum diterapkan, lihat `sandbox/docs/architecture.md`). Terapkan
PPN sebesar 11% sehingga total = subtotal + (subtotal * 0.11), dibulatkan ke
rupiah terdekat.

## Kriteria Sukses (acceptance)
1. `calculateTotal` mengembalikan subtotal + PPN 11%, dibulatkan ke integer.
2. `calculateSubtotal` tetap mengembalikan subtotal tanpa PPN (tidak berubah
   perilakunya).
3. Ada test baru yang memverifikasi PPN.
4. Seluruh gate (lint + test + git diff --check) HIJAU.
5. Ditutup dengan laporan terstruktur sesuai SKILL.md §7.

## Batasan
- Jangan ubah file di luar `sandbox/src/pricing.js` dan `sandbox/test/`.
- Jangan sentuh production/DB/credential/deployment (tidak relevan di PoC).
