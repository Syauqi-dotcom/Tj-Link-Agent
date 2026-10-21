#!/usr/bin/env node
'use strict';

/**
 * Demo end-to-end PoC TJLINK — SIMULASI berskrip satu siklus kerja agent sesuai SKILL.md:
 *   1 Understand -> 2 Explore (MCP read-only) -> 3 Plan -> 4 Implement -> 5 Verify (gate) -> 6 Report.
 * Pembuktian dengan agent sungguhan dilakukan di Kiro IDE (docs/DEMO-GUIDE.md, "Demo agent asli").
 *
 * Pakai: node demo/run-demo.js [--scenario green|red] [--keep] [--fast]
 *   green : implementasi benar          -> gate HIJAU -> laporan ✅ SELESAI      (exit 0)
 *   red   : implementasi lupa pembulatan -> gate MERAH -> laporan ⛔ BELUM SELESAI (exit 1)
 * Tidak menyentuh git index/commit. Output ke demo/output/ (di-ignore git).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { banner, sleep, setFast, mcpCalls, readJsonl } = require('./helpers');
const { pricingEdits, TEST_EDITS, PPN_TEST, applyEdits } = require('./templates');
const { buildReport } = require('./report');

const argv = process.argv.slice(2);
const SCENARIO = argv.includes('--scenario') ? argv[argv.indexOf('--scenario') + 1] : 'green';
if (!['green', 'red'].includes(SCENARIO)) {
  console.error('Skenario harus "green" atau "red".');
  process.exit(2);
}
setFast(argv.includes('--fast'));

const ROOT = path.resolve(__dirname, '..');
const SANDBOX = path.join(ROOT, 'sandbox');
const FILES = {
  pricing: path.join(SANDBOX, 'src', 'pricing.js'),
  pricingTest: path.join(SANDBOX, 'test', 'pricing.test.js'),
  ppnTest: path.join(SANDBOX, 'test', 'ppn.test.js'),
};
const OUT_DIR = path.join(__dirname, 'output');
const AUDIT = path.join(OUT_DIR, `mcp-audit-${SCENARIO}.jsonl`);
const REPORT = path.join(OUT_DIR, `REPORT-${SCENARIO}.md`);
const GATE = path.join(ROOT, '.kiro', 'hooks', 'scripts', 'verify-change.js');
const MCP = path.join(ROOT, 'mcp', 'tjlink-readonly-server.js');
const TASK = 'TJL-DEMO-001 — Terapkan PPN 11% pada total invoice';

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(AUDIT, { force: true });
// Simpan byte asli (termasuk line ending) untuk dipulihkan persis saat cleanup.
const original = Object.fromEntries(
  Object.entries(FILES).map(([k, f]) => [k, fs.existsSync(f) ? fs.readFileSync(f) : null]),
);

function understandExplorePlan() {
  banner(`FASE 1/6 — UNDERSTAND: task card (skenario ${SCENARIO})`);
  console.log(fs.readFileSync(path.join(__dirname, 'TASK.md'), 'utf8').split('\n').slice(0, 12).join('\n'));
  sleep(400);

  banner('FASE 2/6 — EXPLORE: baca existing code & docs via MCP read-only (tercatat di audit log)');
  const [code, docs] = mcpCalls(MCP, AUDIT, [
    ['read_file', { path: 'src/pricing.js' }],
    ['read_file', { path: 'docs/architecture.md' }],
  ]);
  console.log(code.split('\n').slice(0, 8).join('\n'));
  console.log('   ...');
  console.log(`   docs/architecture.md -> "PPN belum diterapkan": ${docs.includes('belum menerapkan PPN') ? 'YA' : 'tidak'}`);
  sleep(400);

  banner('FASE 3/6 — PLAN: perubahan minimal');
  console.log([
    '1. src/pricing.js        : tambah PPN_RATE = 0.11; calculateTotal = round(subtotal * 1.11).',
    '2. calculateSubtotal     : TIDAK diubah.',
    '3. test/pricing.test.js  : sesuaikan ekspektasi total lama.',
    '4. test/ppn.test.js      : test baru (tarif, nilai, pembulatan).',
  ].join('\n'));
  sleep(400);
}

function implement() {
  banner('FASE 4/6 — IMPLEMENT: edit minimal (find -> replace; gagal keras bila anchor tidak ada)');
  fs.writeFileSync(FILES.pricing, applyEdits(original.pricing.toString('utf8'), pricingEdits(SCENARIO), 'src/pricing.js'));
  console.log(`  [ubah] src/pricing.js${SCENARIO === 'red' ? '   <- skenario red: sengaja lupa pembulatan' : ''}`);
  fs.writeFileSync(FILES.pricingTest, applyEdits(original.pricingTest.toString('utf8'), TEST_EDITS, 'test/pricing.test.js'));
  console.log('  [ubah] test/pricing.test.js');
  fs.writeFileSync(FILES.ppnTest, PPN_TEST);
  console.log('  [baru] test/ppn.test.js');
  sleep(400);
}

function verify() {
  banner('FASE 5/6 — VERIFY: gate final (lint + test terkait + git diff --check)');
  const r = spawnSync(process.execPath, [GATE, '--mode', 'final', '--trigger', `demo-${SCENARIO}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  process.stdout.write(`${r.stdout || ''}${r.stderr || ''}`);
  return r.status;
}

function report() {
  banner('FASE 6/6 — REPORT: laporan disusun dari evidence gate + audit log MCP');
  const ev = JSON.parse(fs.readFileSync(path.join(ROOT, '.kiro', 'evidence', 'gate-final.json'), 'utf8'));
  const reads = readJsonl(AUDIT).filter((e) => e.tool === 'read_file');
  const md = buildReport({
    task: TASK,
    scenario: SCENARIO,
    ev,
    reads,
    edits: [
      `sandbox/src/pricing.js — tambah \`PPN_RATE\`; \`calculateTotal\` menambahkan PPN 11%${
        SCENARIO === 'red' ? ' TANPA pembulatan (bug sengaja)' : ', dibulatkan `Math.round`'
      }`,
      'sandbox/test/pricing.test.js — ekspektasi total disesuaikan (333000)',
      'sandbox/test/ppn.test.js — test baru: tarif, nilai total, pembulatan',
    ],
  });
  fs.writeFileSync(REPORT, md);
  console.log(md);
  console.log(`(laporan disimpan: ${path.relative(ROOT, REPORT)})`);
}

function cleanup() {
  if (argv.includes('--keep')) return;
  banner('CLEANUP: kembalikan sandbox ke kondisi awal (git index tidak disentuh)');
  for (const [k, f] of Object.entries(FILES)) {
    if (original[k]) fs.writeFileSync(f, original[k]);
    else fs.rmSync(f, { force: true });
  }
  const v = spawnSync(process.execPath, [GATE, '--verify-evidence'], { cwd: ROOT, encoding: 'utf8' });
  console.log(`  ${`${v.stdout || ''}${v.stderr || ''}`.trim()}`);
  console.log('  -> evidence terikat ke isi kode: setelah kode dikembalikan, evidence lama otomatis STALE.');
}

let exitCode = 1;
try {
  understandExplorePlan();
  implement();
  exitCode = verify();
  report();
} finally {
  cleanup();
}
process.exitCode = exitCode;
