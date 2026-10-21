# Aturan Coding

- Konsistensi di atas preferensi: ikuti gaya, penamaan, dan library yang sudah ada.
- Dependency/framework baru wajib disetujui manusia (guard memblokir `npm install <pkg>`).
- Wajib `'use strict'` di setiap modul JS (sandbox PoC).
- Dilarang `console.log` di `src/` kecuali entry point `src/index.js`.
- Dilarang meninggalkan `TODO`/`FIXME` tanpa tiket yang dirujuk.
- Validasi input di fungsi publik; lempar `TypeError`/`RangeError` dengan pesan jelas.
- Utamakan fungsi murni agar mudah diuji; pisahkan efek samping.

Aturan di atas ditegakkan oleh lint repo (`sandbox/scripts/lint.js` pada PoC ini). Bila lint
diganti toolchain DABN (ESLint/Prettier/tsc), perbarui `lintScript` di `.agent/tjlink.config.json`
dan sesuaikan daftar ini.
