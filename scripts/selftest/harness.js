'use strict';

/**
 * Harness self-test: setiap skenario memakai salinan repo BARU di tmpdir + baseline commit.
 * Repo asli tidak pernah disentuh; tidak ada perintah git destruktif.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SRC_ROOT = path.resolve(__dirname, '..', '..');
const EXCLUDE = new Set(['.git', 'node_modules', 'output', 'evidence', 'audit']);
const MARKER = '.tjlink-selftest';
const results = [];

function check(suite, name, ok, detail = '') {
  results.push({ suite, name, ok: Boolean(ok), detail: String(detail).replace(/\s+/g, ' ').trim().slice(0, 160) });
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(e.name) || e.isSymbolicLink()) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

function makeWs(root) {
  const p = (...x) => path.join(root, ...x);
  const safe = () => {
    if (!root.startsWith(os.tmpdir()) || !fs.existsSync(p(MARKER))) throw new Error(`menolak operasi di luar salinan self-test: ${root}`);
  };
  const run = (cmd, args, opts = {}) => {
    safe();
    const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...opts });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
  };
  const script = (...x) => p('.kiro', 'hooks', 'scripts', ...x);
  return {
    root, p, run,
    git: (...args) => run('git', args),
    node: (args, opts) => run(process.execPath, args, opts),
    gate: (args, input) => run(process.execPath, [script('verify-change.js'), ...args], input === undefined ? {} : { input }),
    guard: (payload) => run(process.execPath, [script('guard.js')], { input: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    payload: (event, tool, input) => JSON.stringify({ hook_event_name: event, cwd: root, session_id: 'selftest', tool_name: tool, tool_input: input }),
    read: (rel) => fs.readFileSync(p(rel), 'utf8'),
    write: (rel, s) => { safe(); fs.mkdirSync(path.dirname(p(rel)), { recursive: true }); fs.writeFileSync(p(rel), s); },
    dispose: () => { safe(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

/**
 * Jalankan fn di salinan repo baru. commit=false meniru repo asli saat ini
 * (semua file ter-stage, belum ada commit).
 */
function withWorkspace(fn, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tjlink-selftest-'));
  copyTree(SRC_ROOT, root);
  fs.writeFileSync(path.join(root, MARKER), 'salinan self-test (aman dihapus)\n');
  const ws = makeWs(root);
  ws.remove = (rel) => {
    if (!root.startsWith(os.tmpdir())) throw new Error('menolak hapus di luar tmpdir');
    fs.rmSync(ws.p(rel), { recursive: true, force: true });
  };
  ws.git('init', '-q');
  ws.git('add', '-A');
  if (opts.commit !== false) {
    ws.git('-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', 'commit', '-q', '-m', 'baseline');
  }
  try {
    return fn(ws);
  } catch (err) {
    check('harness', `exception: ${err.message}`, false, err.stack);
    return undefined;
  } finally {
    if (!opts.keep) ws.dispose();
  }
}

module.exports = { withWorkspace, check, results, SRC_ROOT };
