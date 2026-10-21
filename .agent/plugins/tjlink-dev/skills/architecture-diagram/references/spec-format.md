# Format Spec Diagram

```json
{
  "title": "Judul diagram",
  "subtitle": "Satu kalimat konteks",
  "groups": [{ "id": "g-hook", "label": "Penegakan lokal (hook)", "tone": "orange" }],
  "nodes": [
    { "id": "agent", "label": "Agent", "sub": "Claude Code / Codex", "tone": "blue", "col": 1, "row": 1 },
    { "id": "guard", "label": "Guard", "sub": "PreToolUse", "tone": "orange", "col": 2, "row": 1, "group": "g-hook" }
  ],
  "edges": [
    { "id": "e1", "from": "agent", "to": "guard", "label": "tool tulis/shell", "step": 1 },
    { "id": "e2", "from": "guard", "to": "agent", "label": "exit 2: blokir", "dashed": true }
  ]
}
```

## Tata letak

- Posisi ditentukan `col` dan `row` (grid 0-based); koordinat piksel dihitung otomatis.
- Group dihitung dari kotak pembatas anggotanya dan hanya dekorasi (`container=0`). Letakkan anggota
  satu group pada grid yang bersebelahan dan hindari group yang kotaknya bertumpuk.
- Edge antar node bersebelahan (kolom sama atau baris sama) paling rapi. Hindari edge yang melintasi
  node lain; geser `col`/`row` bila perlu.
- Edge ber-`step` muncul di legenda kanan secara berurutan; edge tanpa `step` untuk hubungan pendukung.

## Warna (`tone`)

`blue`, `green`, `purple`, `teal`, `orange`, `red`, `gray`. Pakai konsisten per peran, mis. `blue` untuk
agent, `orange` untuk penegak lokal, `purple` untuk konteks/MCP, `green` untuk hard gate, `gray` untuk manusia.

## Validasi

`diagram.py` menolak berkas bila: XML tidak well-formed, root bukan `<mxfile>`, atribut `background`
ada, cell `0`/`1` hilang, id duplikat, `source`/`target` edge tidak merujuk cell yang ada, atau style
tidak memuat `fontFamily=Helvetica;`. Validasi berkas lain: `diagram.py --validate <file.drawio>`.
