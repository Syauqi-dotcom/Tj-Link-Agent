# Dokumentasi Sandbox TJLINK (read-only via MCP)

Dokumen ini sengaja sederhana. Tujuannya menunjukkan bahwa Agent bisa
memperoleh konteks dari dokumentasi project melalui MCP read-only, bukan
menebak-nebak.

## Modul

- `src/invoice.js` — util `formatInvoiceNumber(prefix, year, sequence)`.
  Format keluaran: `<PREFIX>-<YEAR>-<SEQUENCE6DIGIT>`, contoh `TJL-2026-000042`.
- `src/pricing.js` — util `calculateSubtotal(items)` dan `calculateTotal(items)`.
  PoC ini belum menerapkan PPN; `calculateTotal` == subtotal.

## Aturan domain

- Nomor invoice selalu uppercase dan di-trim.
- `year` harus 4 digit (2000–9999).
- `sequence` integer >= 0, di-pad menjadi 6 digit.

## Batasan PoC

- Tidak terhubung ke database, billing engine, atau DABN production.
- Semua data bersifat contoh (dummy).
