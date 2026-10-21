# Peta Mekanisme Penegakan

| Lapis | Mekanisme | Sifat |
| ----- | --------- | ----- |
| Aturan selalu aktif | `.agent/AGENTS.md` (steering) | instruksi (soft) |
| Playbook detail | Skill `tjlink-dev` (on-demand) | instruksi (soft) |
| Cegah aksi berbahaya | Hook PreToolUse → `scripts/guard.js` | blokir teknis (exit 2) |
| Umpan balik cepat | Hook PostToolUse → gate `quick` | info ke agent |
| Verifikasi ulang | Hook Stop → gate `final` | minta agent lanjut bila merah |
| Konteks aman | MCP `tjlink-readonly` | read-only + redaksi + audit log |
| Hard gate | `githooks/pre-commit` + CI → gate `ci` | tidak bisa dilewati agent |

Instruksi (steering/skill) membentuk perilaku; hook, MCP, pre-commit, dan CI yang **menegakkan**.
Karena itu klaim "selesai" selalu dicek terhadap evidence, bukan teks laporan.

Hanya lapis CI di server Git yang benar-benar tidak bisa dilewati agent. Lapis lain
mempercepat umpan balik supaya agent memperbaiki sendiri sebelum manusia mereview.
