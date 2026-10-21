#!/usr/bin/env node
'use strict';

/**
 * TJLINK Read-Only MCP Server (PoC, zero-dependency, JSON-RPC 2.0 via stdio)
 *
 * Memberi agent akses TERSTRUKTUR dan READ-ONLY ke sandbox: struktur file, isi file,
 * pencarian, dan git status. Tidak ada tool tulis/hapus/exec/deploy/database.
 *
 * Kebijakan akses (least privilege, berlapis):
 *   1. ALLOWLIST folder & ekstensi — hanya yang terdaftar yang bisa dibaca.
 *   2. DENYLIST pola sensitif — lapis kedua (.env, secret, key, .git, ...).
 *   3. realpath — symlink/junction yang keluar root atau menyamar ditolak.
 *   4. Redaksi secret pada isi yang dikembalikan (password=..., AKIA..., private key).
 *   5. Audit log JSONL setiap pemanggilan tool (tanpa isi file).
 *
 * Env: TJLINK_SANDBOX_ROOT (override root), TJLINK_MCP_AUDIT_LOG (override path audit).
 * Diuji interoperabilitasnya dengan client resmi @modelcontextprotocol/sdk.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');
const { redactSecrets } = require('../lib/secret-patterns');

const SERVER_INFO = { name: 'tjlink-readonly', version: '0.2.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']; // [0] = terbaru yang didukung
const ROOT = fs.realpathSync.native(path.resolve(process.env.TJLINK_SANDBOX_ROOT || path.join(__dirname, '..', 'sandbox')));
const AUDIT_LOG = process.env.TJLINK_MCP_AUDIT_LOG || path.join(__dirname, '..', '.kiro', 'audit', 'mcp-calls.jsonl');
const MAX_BYTES = 64 * 1024;
const MAX_RESULTS = 50;

const ALLOWED_DIRS = ['src', 'test', 'docs', 'scripts'];
const ALLOWED_ROOT_FILES = ['package.json', 'README.md'];
const ALLOWED_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.txt']);
const DENY = [
  /(^|\/)\.env(\.|$)/i, /secret/i, /credential/i, /password/i, /(^|\/)\.git(\/|$)/i,
  /node_modules/i, /\.(pem|key|p12|pfx)$/i, /id_(rsa|ed25519|ecdsa)/i,
];

const toPosix = (p) => p.split(path.sep).join('/');
const sameRel = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
function denied(msg) {
  const e = new Error(`AKSES DITOLAK: ${msg}`);
  e.denied = true;
  return e;
}

/** Cek kebijakan secara leksikal (sebelum menyentuh disk, agar tidak bocor info keberadaan file). */
function checkPolicy(rel, kind) {
  if (rel === '') {
    if (kind === 'dir') return;
    throw denied('root bukan file');
  }
  if (DENY.some((re) => re.test(rel))) throw denied(`pola sensitif (${rel})`);
  const top = rel.split('/')[0];
  if (kind === 'file' && !rel.includes('/')) {
    if (!ALLOWED_ROOT_FILES.includes(rel)) throw denied(`file di luar allowlist (${rel})`);
    return;
  }
  if (!ALLOWED_DIRS.includes(top)) throw denied(`folder di luar allowlist (${rel})`);
  if (kind === 'file' && !ALLOWED_EXT.has(path.extname(rel).toLowerCase())) throw denied(`ekstensi di luar allowlist (${rel})`);
}

/** Resolusi path aman: anti traversal, allowlist, lalu realpath (anti symlink/junction). */
function resolveSafe(input, kind) {
  const lexical = path.resolve(ROOT, String(input || '.'));
  const rel = toPosix(path.relative(ROOT, lexical));
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw denied(`di luar sandbox root (${input})`);
  checkPolicy(rel, kind);
  let real;
  try {
    real = fs.realpathSync.native(lexical);
  } catch {
    throw new Error(`tidak ditemukan: ${rel || '.'}`);
  }
  if (!sameRel(toPosix(path.relative(ROOT, real)), rel)) throw denied(`symlink/junction tidak diizinkan (${rel})`);
  const st = fs.statSync(real);
  if (kind === 'file' && !st.isFile()) throw new Error('path bukan file');
  if (kind === 'dir' && !st.isDirectory()) throw new Error('path bukan direktori');
  return { abs: real, rel, st };
}

/** Telusuri file yang lolos kebijakan; symlink/junction dilewati, tidak diikuti. */
function walkAllowed(dirAbs, out = []) {
  for (const e of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const abs = path.join(dirAbs, e.name);
    const rel = toPosix(path.relative(ROOT, abs));
    try {
      checkPolicy(rel, e.isDirectory() ? 'dir' : 'file');
    } catch {
      continue;
    }
    if (e.isDirectory()) walkAllowed(abs, out);
    else if (e.isFile()) out.push({ abs, rel });
  }
  return out;
}

function auditLog(entry) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, `${JSON.stringify({ at: new Date().toISOString(), server: SERVER_INFO.name, ...entry })}\n`);
  } catch {
    // Kegagalan audit tidak boleh mematikan server read-only.
  }
}

/* --------------------------------- tools --------------------------------- */

function toolListFiles(args) {
  const { abs, rel } = resolveSafe(args.path || '.', 'dir');
  const rows = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const childRel = toPosix(path.relative(ROOT, path.join(abs, e.name)));
    try {
      checkPolicy(childRel, e.isDirectory() ? 'dir' : 'file');
    } catch {
      continue; // entri di luar kebijakan disembunyikan
    }
    rows.push(e.isDirectory() ? `  [dir]  ${e.name}` : `  [file] ${e.name} (${fs.statSync(path.join(abs, e.name)).size} byte)`);
  }
  return { text: `Isi direktori "${rel || '.'}":\n${rows.join('\n') || '  (kosong)'}` };
}

function toolReadFile(args) {
  if (!args.path) throw new Error('parameter "path" wajib diisi');
  const { abs, rel, st } = resolveSafe(args.path, 'file');
  if (st.size > MAX_BYTES) throw new Error(`file terlalu besar (${st.size} byte > ${MAX_BYTES})`);
  const red = redactSecrets(fs.readFileSync(abs, 'utf8'));
  const note = red.count ? `\n\n[catatan: ${red.count} nilai sensitif diredaksi (${red.kinds.join(', ')})]` : '';
  return { text: `# ${rel}\n\n${red.text}${note}`, redactions: red.count };
}

function toolSearch(args) {
  const query = String(args.query || '');
  if (query.length < 2 || query.length > 200) throw new Error('parameter "query" wajib 2-200 karakter');
  const hits = [];
  let redactions = 0;
  for (const f of walkAllowed(ROOT)) {
    if (hits.length >= MAX_RESULTS) break;
    if (fs.statSync(f.abs).size > MAX_BYTES) continue;
    fs.readFileSync(f.abs, 'utf8').split('\n').forEach((line, i) => {
      if (hits.length >= MAX_RESULTS || !line.includes(query)) return;
      const red = redactSecrets(line.trim());
      redactions += red.count;
      hits.push(`${f.rel}:${i + 1}: ${red.text}`);
    });
  }
  return {
    text: hits.length ? `Hasil pencarian (${hits.length}${hits.length >= MAX_RESULTS ? '+' : ''}):\n${hits.join('\n')}` : 'Tidak ada hasil.',
    redactions,
  };
}

function toolGitStatus() {
  // Dibatasi ke sandbox (pathspec "."), read-only: tanpa commit/push/checkout.
  const r = spawnSync('git', ['status', '--short', '--branch', '--', '.'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (r.error) throw new Error(`git tidak tersedia: ${r.error.message}`);
  return { text: (r.stdout || '').trim() || '(working tree bersih)' };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const TOOLS = [
  ['list_files', 'Daftar file & folder sandbox yang diizinkan (read-only).', { path: { type: 'string', description: 'path relatif dari root sandbox (default ".")' } }, [], toolListFiles],
  ['read_file', 'Baca satu file sandbox yang diizinkan (read-only, maks 64KB, secret diredaksi).', { path: { type: 'string', description: 'path relatif file' } }, ['path'], toolReadFile],
  ['search_code', 'Cari teks di file sandbox yang diizinkan (read-only, maks 50 hasil).', { query: { type: 'string', description: 'teks yang dicari (2-200 karakter)' } }, ['query'], toolSearch],
  ['git_status', 'git status ringkas, dibatasi ke sandbox (read-only).', {}, [], toolGitStatus],
].map(([name, description, properties, required, handler]) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
  annotations: { title: name, ...READ_ONLY },
  handler,
}));

/* ------------------------------ JSON-RPC 2.0 ------------------------------ */

function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: (msg && msg.id) ?? null, error: { code: -32600, message: 'invalid request' } };
  }
  const { id, method } = msg;
  const params = msg.params || {};
  const isNotification = id === undefined;
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const protocolVersion = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return reply({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Server READ-ONLY sandbox TJLINK. Tidak ada operasi tulis/hapus/eksekusi/deploy.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ handler, ...t }) => t) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(-32602, `tool tidak dikenal: ${params.name}`);
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      const logged = { tool: tool.name, args: { path: args.path, query: args.query } };
      try {
        const { text, redactions = 0 } = tool.handler(args);
        auditLog({ ...logged, outcome: 'ok', bytes: Buffer.byteLength(text), redactions });
        return reply({ content: [{ type: 'text', text }] });
      } catch (err) {
        auditLog({ ...logged, outcome: err.denied ? 'denied' : 'error', message: err.message });
        return reply({ content: [{ type: 'text', text: `ERROR: ${err.message}` }], isError: true });
      }
    }
    default:
      return isNotification ? null : fail(-32601, `method tidak didukung: ${method}`);
  }
}

const send = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
    return;
  }
  if (Array.isArray(msg)) {
    // Batch JSON-RPC (dipakai protokol 2025-03-26): balas sebagai array.
    const out = msg.map(handle).filter(Boolean);
    if (out.length) send(out);
    return;
  }
  const res = handle(msg);
  if (res) send(res);
});

process.stderr.write(`[${SERVER_INFO.name}] siap. root=${ROOT} (READ-ONLY). tools=${TOOLS.map((t) => t.name).join(',')}\n`);
