#!/usr/bin/env node
'use strict';

/**
 * Smoke test MCP server read-only TJLINK.
 * Menjalankan server sebagai child process, mengirim beberapa permintaan
 * JSON-RPC, dan memverifikasi:
 *   - initialize mengembalikan serverInfo
 *   - tools/list memuat 4 tool
 *   - read_file bisa membaca file sandbox
 *   - guardrail MENOLAK akses .env dan path di luar root
 *
 * Exit code 0 jika semua asersi lolos, selain itu 1.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert');

const serverPath = path.join(__dirname, 'tjlink-readonly-server.js');
const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'src/invoice.js' } } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_file', arguments: { path: '.env' } } },
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'read_file', arguments: { path: '../.kiro/hooks/tjlink-verify-on-change.json' } } },
  { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_files', arguments: { path: '.' } } },
];

const responses = new Map();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    responses.set(msg.id, msg);
    if (responses.size === requests.length) finish();
  }
});

for (const req of requests) {
  child.stdin.write(JSON.stringify(req) + '\n');
}

function finish() {
  child.kill();
  try {
    // initialize
    assert.strictEqual(responses.get(1).result.serverInfo.name, 'tjlink-readonly', 'serverInfo.name');

    // tools/list
    const tools = responses.get(2).result.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(tools, ['git_status', 'list_files', 'read_file', 'search_code'], 'daftar tool');

    // read_file sah
    const okRead = responses.get(3).result.content[0].text;
    assert.ok(okRead.includes('formatInvoiceNumber'), 'read_file src/invoice.js memuat fungsi');
    assert.ok(!responses.get(3).result.isError, 'read_file sah tidak error');

    // guardrail: .env ditolak
    const envRes = responses.get(4).result;
    assert.ok(envRes.isError, '.env harus ditolak');
    assert.ok(envRes.content[0].text.includes('AKSES DITOLAK'), '.env pesan ditolak');

    // guardrail: path traversal keluar root ditolak
    const travRes = responses.get(5).result;
    assert.ok(travRes.isError, 'path di luar root harus ditolak');

    // list_files
    const listText = responses.get(6).result.content[0].text;
    assert.ok(listText.includes('src'), 'list_files memuat folder src');

    console.log('SMOKE TEST MCP: SEMUA ASERSI LOLOS ✅');
    console.log('  - initialize OK');
    console.log('  - tools/list = ' + tools.join(', '));
    console.log('  - read_file (sah) OK');
    console.log('  - guardrail .env ditolak OK');
    console.log('  - guardrail path-traversal ditolak OK');
    console.log('  - list_files OK');
    process.exit(0);
  } catch (err) {
    console.error('SMOKE TEST MCP GAGAL ⛔');
    console.error('  ' + err.message);
    process.exit(1);
  }
}

setTimeout(() => {
  console.error('SMOKE TEST MCP: timeout menunggu respons ⛔');
  child.kill();
  process.exit(1);
}, 8000);
