'use strict';

/** Susun laporan SKILL §7 dari EVIDENCE gate + AUDIT LOG MCP, bukan dari klaim bebas agent. */

function buildReport({ task, scenario, ev, reads, edits }) {
  const check = (n) => ev.checks.find((c) => c.name === n) || { status: 'N/A', summary: '-', details: [] };
  const show = (c) => [`${c.status} — ${c.summary}`, ...c.details.slice(0, 5).map((d) => `                   - ${d}`)].join('\n');
  const pass = ev.overall === 'PASS';
  const readLines = reads.length
    ? reads.map((r) => `- ${r.args.path} — via MCP \`${r.tool}\` (${r.outcome}, ${r.bytes || 0} byte, ${r.at})`)
    : ['- (tidak ada pembacaan tercatat — melanggar SKILL §5)'];

  return [
    `## Laporan Tugas: ${task}`,
    '',
    `**Status:** ${pass ? '✅ SELESAI' : '⛔ BELUM SELESAI (gate gagal)'}`,
    `_Skenario demo: ${scenario}. Status diturunkan otomatis dari evidence gate, bukan ditulis bebas oleh agent._`,
    '',
    '### 1. Tujuan',
    'Menerapkan PPN 11% pada `calculateTotal` (dibulatkan ke rupiah) tanpa mengubah perilaku `calculateSubtotal`.',
    '',
    '### 2. File yang Dibaca (bukti "baca dulu" — dari audit log MCP)',
    ...readLines,
    '',
    '### 3. Perubahan',
    ...edits.map((e) => `- ${e}`),
    '',
    `### 4. Hasil Verifikasi (gate otomatis, mode ${ev.mode})`,
    '```text',
    `Lint             : ${show(check('lint'))}`,
    `Test             : ${show(check('test'))}`,
    `git diff --check : ${show(check('git diff --check'))}`,
    '```',
    `- Test terkait yang dijalankan: ${ev.testSelection.files.join(', ') || '-'} (${ev.testSelection.reason})`,
    `- Evidence: \`.kiro/evidence/gate-${ev.mode}.json\`, fingerprint \`${ev.fingerprint}\`, ${ev.finishedAt}, baseline: ${ev.baseline}`,
    '',
    '### 5. Risiko & Asumsi',
    '- Pembulatan memakai `Math.round` (pembulatan standar); kebijakan akuntansi resmi perlu dikonfirmasi.',
    '- PPN tunggal 11% untuk semua item (belum ada item bebas PPN).',
    ...(pass ? [] : ['- Gate MERAH: perubahan tidak boleh di-commit/merge sampai seluruh gate hijau.']),
    '',
    '### 6. Langkah Lanjutan',
    pass
      ? '- Review manusia, lalu commit; pre-commit + CI menjalankan gate mode ci sebagai pemeriksaan otoritatif.'
      : '- Perbaiki penyebab kegagalan di atas, jalankan ulang gate, lalu perbarui laporan ini.',
    '',
  ].join('\n');
}

module.exports = { buildReport };
