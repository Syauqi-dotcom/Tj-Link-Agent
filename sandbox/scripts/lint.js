'use strict';

/**
 * Lint/syntax checker ringan tanpa dependency eksternal (PoC).
 * Di project TJLINK sungguhan, ganti dengan ESLint/Prettier/tsc.
 *
 * Pemakaian:
 *   node scripts/lint.js              -> lint semua file .js (rekursif)
 *   node scripts/lint.js src/a.js ... -> lint file tertentu saja (mode cepat)
 *
 * Aturan:
 *   1. Syntax valid (node --check).
 *   2. Wajib 'use strict'.
 *   3. Dilarang console.log di src/ kecuali src/index.js (entry point demo).
 *   4. Dilarang penanda pekerjaan menggantung (TO DO / FIX ME) tanpa tiket.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['src', 'test', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git']);
// Keyword dirakit saat runtime agar linter tidak menandai dirinya sendiri.
const PENDING = new RegExp(`\\b(${['TO' + 'DO', 'FIX' + 'ME'].join('|')})\\b`);

/** Kumpulkan file .js secara rekursif (symlink/junction tidak diikuti). */
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(abs, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

function collectTargets(args) {
  if (args.length === 0) return TARGET_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
  return args
    .map((a) => path.resolve(ROOT, a))
    .filter((f) => f.endsWith('.js') && fs.existsSync(f));
}

/** Lint satu file; kembalikan daftar masalah (kosong = lolos). */
function lintFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    const lines = (syntax.stderr || '').split('\n').map((l) => l.trim());
    const where = (lines[0] || '').split(':').pop();
    const what = lines.find((l) => /Error/.test(l)) || 'syntax error';
    return [`${rel}:${where}: syntax error — ${what}`];
  }

  const problems = [];
  const content = fs.readFileSync(file, 'utf8');
  if (!/['"]use strict['"]/.test(content)) {
    problems.push(`${rel}: wajib ada deklarasi 'use strict'`);
  }
  if (rel.startsWith('src/') && rel !== 'src/index.js' && /console\.log\s*\(/.test(content)) {
    problems.push(`${rel}: console.log tidak diperbolehkan di modul src/ (gunakan return value/logger)`);
  }
  const pending = content.match(PENDING);
  if (pending) {
    problems.push(`${rel}: ditemukan penanda ${pending[1]} yang belum diselesaikan`);
  }
  return problems;
}

const files = collectTargets(process.argv.slice(2));
const problems = files.flatMap(lintFile);

if (problems.length > 0) {
  console.error(`LINT GAGAL (${problems.length} masalah):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`LINT OK: ${files.length} file lolos pengecekan.`);
