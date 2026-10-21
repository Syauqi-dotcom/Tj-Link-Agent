#!/usr/bin/env node
'use strict';

/**
 * Self-test PoC TJLINK — membuktikan klaim PoC secara otomatis & repeatable.
 * Setiap suite berjalan di salinan repo sementara (tmpdir) dengan baseline commit sendiri;
 * repo asli tidak disentuh dan tidak ada perintah git destruktif.
 *
 * Pakai: node scripts/selftest.js [--only config,gate,evidence,guard,mcp,demo]
 * Exit code 0 = semua asersi lolos.
 */

const { results } = require('./selftest/harness');

const SUITES = {
  config: require('./selftest/config-cases'),
  gate: require('./selftest/gate-cases'),
  evidence: require('./selftest/gate-evidence-cases'),
  guard: require('./selftest/guard-cases'),
  mcp: require('./selftest/mcp-cases'),
  demo: require('./selftest/demo-cases'),
};

const i = process.argv.indexOf('--only');
const selected = i >= 0 ? String(process.argv[i + 1] || '').split(',') : Object.keys(SUITES);
const started = Date.now();

for (const name of selected) {
  const before = results.length;
  try {
    if (!SUITES[name]) throw new Error(`suite tidak dikenal: ${name}`);
    SUITES[name]();
  } catch (err) {
    results.push({ suite: name, name: `exception: ${err.message}`, ok: false, detail: '' });
  }
  if (results.length === before) results.push({ suite: name, name: 'suite tidak menghasilkan asersi', ok: false, detail: '' });
}

let current = '';
for (const r of results) {
  if (r.suite !== current) {
    current = r.suite;
    console.log(`\n[${current}]`);
  }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `\n          -> ${r.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok).length;
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\nSELFTEST: ${results.length - failed}/${results.length} asersi lolos (${secs} dtk).`);
process.exitCode = failed ? 1 : 0;
