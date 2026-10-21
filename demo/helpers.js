'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

let fast = false;
const setFast = (v) => {
  fast = Boolean(v);
};
/** Jeda singkat agar enak ditonton saat rekam layar (tanpa busy-wait). */
const sleep = (ms) => {
  if (!fast) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function banner(text) {
  const line = '─'.repeat(64);
  console.log(`\n${line}\n${text}\n${line}`);
}

/** Panggil MCP server read-only lewat stdio JSON-RPC — jalur yang sama dengan agent di IDE. */
function mcpCalls(serverPath, auditLog, calls) {
  const init = {
    jsonrpc: '2.0', id: 0, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tjlink-demo', version: '1' } },
  };
  const reqs = [init, { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...calls.map(([name, args], i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: args } }))];
  const r = spawnSync(process.execPath, [serverPath], {
    input: `${reqs.map((x) => JSON.stringify(x)).join('\n')}\n`,
    encoding: 'utf8',
    env: { ...process.env, TJLINK_MCP_AUDIT_LOG: auditLog },
  });
  const byId = new Map(
    (r.stdout || '').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((m) => [m.id, m]),
  );
  return calls.map((_, i) => {
    const m = byId.get(i + 1);
    return m && m.result ? m.result.content[0].text : `(gagal: ${JSON.stringify(m && m.error)})`;
  });
}

const readJsonl = (f) =>
  fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

module.exports = { banner, sleep, setFast, mcpCalls, readJsonl };
