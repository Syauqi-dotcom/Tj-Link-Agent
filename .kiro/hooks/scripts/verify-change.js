#!/usr/bin/env node
'use strict';

/**
 * TJLINK Verification Gate — satu skrip, dipakai di beberapa lapis:
 *   --mode quick  : Hook PostToolUse  -> lint file yang baru diedit (cepat, < 1 dtk).
 *   --mode final  : agent / Stop hook / demo -> lint + test TERKAIT + diff check + evidence.
 *   --mode ci     : pre-commit & CI   -> lint + SELURUH test + diff check + evidence.
 *   --verify-evidence [--evidence-mode final|ci] : cek evidence masih cocok dgn kode (FRESH/STALE).
 * Opsi: --hook (baca payload JSON hook Kiro dari stdin), --on-stop, --trigger <nama>, --file <path>.
 *
 * Kontrak exit code: 0 = lolos/skip, 1 = gagal (detail di STDERR, diteruskan IDE ke agent).
 * Mode --on-stop selalu exit 0; bila gagal mencetak {"decision":"block","reason":...}
 * agar agent melanjutkan perbaikan (dengan batas pengulangan, anti-loop).
 *
 * Read-only terhadap kode: tidak commit, tidak stage, tidak mengubah file project.
 * Yang ditulis hanya bukti di .kiro/evidence/ (di-ignore git).
 */

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = {
  projectDir: 'sandbox', // scope gate, relatif dari root repo
  srcDir: 'src',
  testDir: 'test',
  lintScript: 'scripts/lint.js',
  coverageExempt: ['src/index.js'], // entry point demo, sengaja tanpa unit test
  fullSuiteTriggers: ['package.json', 'scripts/'], // perubahan ini -> jalankan seluruh test
  maxStopBlocksSameState: 2,
  maxStopBlocksPerSession: 5,
};

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROJECT = path.join(REPO_ROOT, CONFIG.projectDir);
const EVIDENCE_DIR = path.join(REPO_ROOT, '.kiro', 'evidence');
const SKIP_DIRS = new Set(['node_modules', '.git']);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const toPosix = (p) => p.split(path.sep).join('/');
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/* ------------------------------- util ------------------------------- */

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true });
  return { code: r.error ? -1 : r.status, out: r.stdout || '', err: r.stderr || (r.error ? r.error.message : '') };
}
const git = (...args) => sh('git', args, REPO_ROOT);

/** Payload hook hanya dibaca bila --hook (hindari blok menunggu stdin di terminal). */
function readHookPayload() {
  if (!flag('hook')) return null;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(abs, out);
    else if (e.isFile()) out.push(abs);
  }
  return out;
}

/** Sidik jari isi scope: berubah satu byte saja -> fingerprint berubah. */
function fingerprint() {
  const h = crypto.createHash('sha256');
  const files = walkFiles(PROJECT).map((f) => [toPosix(path.relative(PROJECT, f)), f]);
  files.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [rel, abs] of files) {
    h.update(`${rel}\0${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}\n`);
  }
  return `sha256:${h.digest('hex')}`;
}

function gitInfo() {
  const inside = git('rev-parse', '--is-inside-work-tree');
  if (inside.code !== 0 || inside.out.trim() !== 'true') return { repo: false, head: null };
  const head = git('rev-parse', '--short', 'HEAD');
  return { repo: true, head: head.code === 0 ? head.out.trim() : null };
}

/** File berubah di scope relatif HEAD (unstaged + staged + untracked). null = tanpa baseline. */
function changedFiles(info) {
  if (!info.repo || !info.head) return null;
  const r = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--', CONFIG.projectDir);
  if (r.code !== 0) return null;
  const parts = r.out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    files.push(parts[i].slice(3));
    if (parts[i][0] === 'R' || parts[i][0] === 'C') i += 1; // lewati path asal rename/copy
  }
  return files;
}

/* ------------------------------ checks ------------------------------ */

function checkLint(files) {
  const t0 = Date.now();
  const r = sh(process.execPath, [CONFIG.lintScript, ...(files || [])], PROJECT);
  const ok = r.code === 0;
  const lines = (ok ? r.out : r.err || r.out).split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    name: 'lint',
    status: ok ? 'PASS' : 'FAIL',
    summary: lines[0] || (ok ? 'LINT OK' : 'lint gagal'),
    details: ok ? [] : lines.slice(1, 16).map((l) => l.replace(/^- /, '')),
    durationMs: Date.now() - t0,
  };
}

/** Modul relatif yang di-require sebuah file test (untuk pemetaan test terkait). */
function requiredModules(testFile) {
  const out = [];
  const src = fs.readFileSync(testFile, 'utf8');
  for (const m of src.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const p = path.resolve(path.dirname(testFile), m[1]);
    out.push(p.endsWith('.js') ? p : `${p}.js`);
  }
  return out;
}

/** Pilih test terkait perubahan; tandai file src yang tidak di-cover test (SKILL §6). */
function selectTests(changed) {
  const allTests = walkFiles(path.join(PROJECT, CONFIG.testDir)).filter((f) => f.endsWith('.js'));
  if (changed === null) {
    return { full: true, files: allTests, uncovered: [], reason: 'belum ada baseline commit: seluruh test dijalankan' };
  }
  const selected = new Set();
  const uncovered = [];
  let full = false;
  for (const repoRel of changed) {
    const rel = toPosix(path.relative(CONFIG.projectDir, repoRel));
    const abs = path.join(PROJECT, rel);
    if (!fs.existsSync(abs)) full = true; // file dihapus -> uji semuanya
    else if (CONFIG.fullSuiteTriggers.some((t) => rel === t || rel.startsWith(t))) full = true;
    else if (rel.startsWith(`${CONFIG.testDir}/`) && rel.endsWith('.js')) selected.add(abs);
    else if (rel.startsWith(`${CONFIG.srcDir}/`) && rel.endsWith('.js')) {
      const hits = allTests.filter((t) => requiredModules(t).some((m) => path.relative(m, abs) === ''));
      hits.forEach((h) => selected.add(h));
      if (hits.length === 0 && !CONFIG.coverageExempt.includes(rel)) uncovered.push(rel);
    }
  }
  if (full) return { full: true, files: allTests, uncovered, reason: 'perubahan konfigurasi/skrip/penghapusan: seluruh test' };
  return {
    full: false,
    files: [...selected],
    uncovered,
    reason: selected.size || uncovered.length ? 'test terkait perubahan' : 'tidak ada perubahan kode yang perlu dites',
  };
}

function parseTap(out) {
  const num = (k) => {
    const m = out.match(new RegExp(`^# ${k} (\\d+)`, 'm'));
    return m ? Number(m[1]) : 0;
  };
  const lines = out.split('\n');
  const failures = [];
  lines.forEach((l, i) => {
    const m = l.match(/^not ok \d+ - (.+)$/);
    if (!m) return;
    // Blok YAML TAP setelah "not ok": ambil baris pertama pesan error + nilai actual/expected.
    const block = lines.slice(i + 1, i + 40);
    const end = block.findIndex((x) => /^\s*\.\.\.\s*$/.test(x));
    const yaml = end >= 0 ? block.slice(0, end) : block;
    const pick = (k) => {
      const y = yaml.find((x) => new RegExp(`^\\s{2}${k}:`).test(x));
      return y ? y.slice(y.indexOf(':') + 1).trim() : null;
    };
    const e = yaml.findIndex((x) => /^\s*error:/.test(x));
    const inline = e >= 0 ? yaml[e].replace(/^\s*error:\s*/, '').replace(/^\|-?$/, '') : '';
    const msg = (inline || (e >= 0 ? (yaml[e + 1] || '').trim() : '')).replace(/^'|'$/g, '');
    const values = pick('actual') !== null && pick('expected') !== null ? ` (actual ${pick('actual')}, expected ${pick('expected')})` : '';
    failures.push(`${m[1].trim()}${msg ? ` — ${msg.slice(0, 120)}` : ''}${values}`);
  });
  return { total: num('tests'), pass: num('pass'), fail: num('fail'), failures };
}

function checkTests(sel) {
  const t0 = Date.now();
  const rel = (f) => toPosix(path.relative(PROJECT, f));
  const base = { name: 'test', details: [], tests: { files: sel.full ? ['(seluruh suite)'] : sel.files.map(rel), pass: 0, fail: 0 } };
  const gaps = sel.uncovered.map((u) => `${u}: tidak ada test yang meng-cover file ini (SKILL §6)`);
  if (!sel.full && sel.files.length === 0) {
    return { ...base, status: gaps.length ? 'FAIL' : 'SKIP', summary: gaps.length ? 'perubahan src tanpa test' : sel.reason, details: gaps, durationMs: 0 };
  }
  const r = sh(process.execPath, ['--test', '--test-reporter=tap', ...(sel.full ? [] : sel.files.map(rel))], PROJECT);
  const tap = parseTap(r.out);
  const ok = r.code === 0 && tap.fail === 0 && gaps.length === 0;
  return {
    ...base,
    status: ok ? 'PASS' : 'FAIL',
    summary: `${tap.pass} pass / ${tap.fail} fail (${sel.full ? 'seluruh suite' : `${sel.files.length} file test terkait`})`,
    details: [...tap.failures, ...gaps, ...(r.code !== 0 && !tap.failures.length && !gaps.length ? [r.err.trim().slice(0, 300)] : [])],
    tests: { ...base.tests, pass: tap.pass, fail: tap.fail },
    durationMs: Date.now() - t0,
  };
}

/** Pemeriksaan ala git diff --check untuk file untracked (git tidak memeriksanya). */
function scanWhitespace(label, content) {
  if (content.includes('\u0000')) return []; // file biner
  const issues = [];
  content.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (/[ \t]+$/.test(line)) issues.push(`${label}:${i + 1}: trailing whitespace.`);
    if (/^[ \t]* \t/.test(line)) issues.push(`${label}:${i + 1}: space before tab in indent.`);
    if (/^(<{7}|>{7}|={7})(\s|$)/.test(line)) issues.push(`${label}:${i + 1}: leftover conflict marker`);
  });
  if (/\n[ \t]*\r?\n$/.test(content)) issues.push(`${label}: new blank line at EOF.`);
  return issues;
}

/** git diff --check untuk perubahan unstaged DAN staged, plus scan file untracked. */
function checkDiff(info) {
  const t0 = Date.now();
  const issues = [];
  if (info.repo) {
    for (const [label, args] of [['', ['diff', '--check']], ['[staged] ', ['diff', '--cached', '--check']]]) {
      const r = git(...args, '--', CONFIG.projectDir);
      if (r.code === 0) continue;
      const lines = r.out.split('\n').filter((l) => l && !l.startsWith('+'));
      if (lines.length) issues.push(...lines.map((l) => `${label}${l.trim()}`));
      else issues.push(`git ${args.join(' ')} gagal: ${r.err.trim().slice(0, 200)}`);
    }
    const u = git('ls-files', '--others', '--exclude-standard', '-z', '--', CONFIG.projectDir);
    for (const rel of u.out.split('\0').filter(Boolean)) {
      const abs = path.join(REPO_ROOT, rel);
      if (fs.statSync(abs).size <= 1024 * 1024) issues.push(...scanWhitespace(`[untracked] ${rel}`, fs.readFileSync(abs, 'utf8')));
    }
  } else {
    for (const f of walkFiles(PROJECT)) issues.push(...scanWhitespace(toPosix(path.relative(REPO_ROOT, f)), fs.readFileSync(f, 'utf8')));
  }
  return {
    name: 'git diff --check',
    status: issues.length ? 'FAIL' : 'PASS',
    summary: issues.length
      ? `${issues.length} masalah whitespace/conflict marker`
      : `bersih (unstaged + staged + untracked${info.repo ? '' : '; bukan repo git, scan langsung'})`,
    details: issues.slice(0, 15),
    durationMs: Date.now() - t0,
  };
}

/* ------------------------------ evidence ------------------------------ */

function runGate(mode, trigger) {
  const started = Date.now();
  const info = gitInfo();
  const changed = changedFiles(info);
  const sel = mode === 'ci' ? { full: true, files: [], uncovered: [], reason: 'mode ci: seluruh test' } : selectTests(changed);
  const checks = [checkLint(), checkTests(sel), checkDiff(info)];
  const ev = {
    schema: 'tjlink-gate-evidence/v1',
    mode,
    trigger,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    scope: CONFIG.projectDir,
    baseline: info.repo ? (info.head ? `HEAD ${info.head}` : 'belum ada commit') : 'bukan repo git',
    changedFiles: changed,
    testSelection: { full: sel.full, reason: sel.reason, files: checks[1].tests.files },
    checks: checks.map(({ tests, ...c }) => c),
    tests: { pass: checks[1].tests.pass, fail: checks[1].tests.fail },
    overall: checks.some((c) => c.status === 'FAIL') ? 'FAIL' : 'PASS',
    fingerprint: fingerprint(),
    runtime: { node: process.version, platform: process.platform },
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, `gate-${mode}.json`), `${JSON.stringify(ev, null, 2)}\n`);
  const line = { at: ev.finishedAt, mode, trigger, overall: ev.overall, fingerprint: ev.fingerprint };
  fs.appendFileSync(path.join(EVIDENCE_DIR, 'history.jsonl'), `${JSON.stringify(line)}\n`);
  return ev;
}

/* ------------------------------- output ------------------------------- */

const summaryText = (ev) =>
  `TJLINK gate (${ev.mode}) = ${ev.overall}\n` +
  ev.checks.map((c) => `  [${c.status}] ${c.name.padEnd(16)} ${c.summary}`).join('\n') +
  `\n  evidence: .kiro/evidence/gate-${ev.mode}.json (${ev.fingerprint.slice(0, 19)}...)\n`;

const failureText = (ev) =>
  ev.checks
    .filter((c) => c.status === 'FAIL')
    .flatMap((c) => [`${c.name}:`, ...c.details.map((d) => `  - ${d}`)])
    .join('\n');

/* -------------------------------- modes -------------------------------- */

/** PostToolUse: lint file yang baru diedit saja. Bukan .js di scope -> diam (exit 0). */
function runQuick(payload) {
  const input = (payload && payload.tool_input) || {};
  const raw = opt('file') || input.path || input.targetFile || input.file_path || input.filePath;
  if (!raw) return 0; // tanpa path: biarkan final gate yang menangkap
  const abs = path.resolve((payload && payload.cwd) || REPO_ROOT, String(raw));
  const rel = toPosix(path.relative(PROJECT, abs));
  if (rel.startsWith('..') || path.isAbsolute(rel) || !rel.endsWith('.js') || !fs.existsSync(abs)) return 0;
  const res = checkLint([rel]);
  const label = `${CONFIG.projectDir}/${rel}`;
  if (res.status === 'PASS') {
    process.stdout.write(`TJLINK quick-check OK: ${label}\n`);
    return 0;
  }
  process.stderr.write(
    `TJLINK quick-check GAGAL: ${label}\n${res.details.map((d) => `  - ${d}`).join('\n')}\n` +
      'Perbaiki sebelum lanjut. Task belum boleh dinyatakan selesai.\n',
  );
  return 1;
}

/** Stop hook: verifikasi ulang independen setelah agent selesai, dengan anti-loop. */
function runStop(payload) {
  const changed = changedFiles(gitInfo());
  if (changed && changed.length === 0) return 0; // tidak ada perubahan di scope
  const fp = fingerprint();
  const last = readJson(path.join(EVIDENCE_DIR, 'gate-final.json'));
  if (last && last.fingerprint === fp && last.overall === 'PASS') return 0; // sudah terverifikasi hijau
  const ev = last && last.fingerprint === fp ? last : runGate('final', 'stop-hook');
  if (ev.overall === 'PASS') {
    process.stdout.write(`TJLINK final-gate PASS (${ev.fingerprint.slice(0, 19)}...)\n`);
    return 0;
  }
  const statePath = path.join(EVIDENCE_DIR, 'stop-state.json');
  const sid = (payload && payload.session_id) || 'unknown';
  let st = readJson(statePath);
  if (!st || st.sessionId !== sid) st = { sessionId: sid, total: 0, perState: {} };
  const same = st.perState[ev.fingerprint] || 0;
  if (same >= CONFIG.maxStopBlocksSameState || st.total >= CONFIG.maxStopBlocksPerSession) {
    process.stdout.write('TJLINK final-gate FAIL — batas pengulangan tercapai. Status WAJIB ⛔ BELUM SELESAI. Lihat .kiro/evidence/gate-final.json\n');
    return 0;
  }
  st.total += 1;
  st.perState[ev.fingerprint] = same + 1;
  fs.writeFileSync(statePath, `${JSON.stringify(st, null, 2)}\n`);
  const reason =
    `Gate TJLINK GAGAL — task BELUM selesai.\n${failureText(ev)}\n` +
    'Perbaiki penyebabnya, jalankan ulang `node .kiro/hooks/scripts/verify-change.js --mode final`, ' +
    'lalu perbarui laporan (status ⛔ BELUM SELESAI bila masih merah).';
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
  return 0;
}

/** Cocokkan evidence terakhir dengan isi kode saat ini (anti klaim basi). */
function runVerifyEvidence() {
  const mode = opt('evidence-mode', 'final');
  const ev = readJson(path.join(EVIDENCE_DIR, `gate-${mode}.json`));
  if (!ev) {
    process.stderr.write(`Evidence gate-${mode}.json tidak ditemukan. Jalankan gate dulu.\n`);
    return 1;
  }
  const fresh = ev.fingerprint === fingerprint();
  const ok = fresh && ev.overall === 'PASS';
  const msg =
    `Evidence ${mode}: overall=${ev.overall}, ` +
    `${fresh ? 'FRESH (cocok dengan kode saat ini)' : 'STALE (kode berubah setelah gate dijalankan)'}, at=${ev.finishedAt}\n`;
  (ok ? process.stdout : process.stderr).write(msg);
  return ok ? 0 : 1;
}

function main() {
  if (flag('verify-evidence')) return runVerifyEvidence();
  const payload = readHookPayload();
  if (MODE === 'quick') return runQuick(payload);
  if (flag('on-stop') || (payload && payload.hook_event_name === 'Stop')) return runStop(payload);
  const mode = MODE === 'ci' ? 'ci' : 'final';
  const ev = runGate(mode, opt('trigger', payload ? payload.hook_event_name || 'hook' : 'manual'));
  if (ev.overall === 'PASS') {
    process.stdout.write(summaryText(ev));
    return 0;
  }
  process.stderr.write(`${summaryText(ev)}${failureText(ev)}\n⛔ GATE GAGAL. Task TIDAK BOLEH dinyatakan selesai.\n`);
  return 1;
}

const MODE = opt('mode', 'final');
process.exitCode = main();
