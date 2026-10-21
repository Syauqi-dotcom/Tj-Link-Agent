'use strict';

/** MCP read-only: protokol, allowlist, redaksi, junction, scope git, audit log (regresi P8-P11). */

const fs = require('node:fs');
const { withWorkspace, check } = require('./harness');

const S = 'mcp read-only';
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const text = (m) => (m && m.result && m.result.content ? m.result.content[0].text : JSON.stringify(m));

function mcpCases() {
  withWorkspace((ws) => {
    ws.write('sandbox/docs/notes.md', 'db_password = "hunter2"\naws = AKIAIOSFODNN7EXAMPLE\n');
    ws.write('sandbox/config/database.yml', 'password: hunter2\n');
    ws.write('outside-secret/prod.md', 'PROD_SECRET_MARKER di luar sandbox\n');
    ws.write('README.md', `${ws.read('README.md')}\n`);
    fs.symlinkSync(ws.p('outside-secret'), ws.p('sandbox', 'docs', 'escape'), 'junction');

    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      { jsonrpc: '2.0', id: 3, method: 'ping' },
      { jsonrpc: '2.0', id: 4, method: 'tools/list' },
      call(5, 'read_file', { path: 'src/pricing.js' }),
      call(6, 'read_file', { path: '.env' }),
      call(7, 'read_file', { path: '../.kiro/hooks' }),
      call(8, 'read_file', { path: 'config/database.yml' }),
      call(9, 'read_file', { path: 'docs/notes.md' }),
      call(10, 'read_file', { path: 'docs/escape/prod.md' }),
      call(11, 'search_code', { query: 'PROD_SECRET_MARKER' }),
      call(12, 'git_status', {}),
      call(13, 'tool_tidak_ada', {}),
      [{ jsonrpc: '2.0', id: 14, method: 'ping' }, { jsonrpc: '2.0', id: 15, method: 'ping' }],
    ];
    const r = ws.node([ws.p('mcp', 'tjlink-readonly-server.js')], {
      input: `${msgs.map((m) => JSON.stringify(m)).join('\n')}\n`,
      env: { ...process.env, TJLINK_MCP_AUDIT_LOG: ws.p('audit.jsonl') },
    });
    const all = r.out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).flat();
    const by = (id) => all.find((m) => m.id === id) || {};
    const err = (id) => Boolean(by(id).result && by(id).result.isError);

    check(S, 'negosiasi protokol: versi didukung di-echo, versi asing -> terbaru', by(1).result.protocolVersion === '2025-06-18' && by(2).result.protocolVersion === '2025-06-18');
    check(S, '[P11] ping dijawab', Boolean(by(3).result) && !by(3).error);
    const tools = (by(4).result || {}).tools || [];
    check(S, 'semua tool beranotasi readOnlyHint', tools.length === 4 && tools.every((t) => t.annotations.readOnlyHint), tools.map((t) => t.name).join(','));
    check(S, 'read_file file sah', text(by(5)).includes('calculateSubtotal'));
    check(S, '.env & path traversal ditolak', err(6) && err(7) && text(by(6)).includes('AKSES DITOLAK'));
    check(S, '[P9] config/database.yml ditolak oleh allowlist', err(8) && !text(by(8)).includes('hunter2'), text(by(8)));
    check(S, '[P9] secret di docs/notes.md diredaksi', !/hunter2|AKIAIOSFODNN7EXAMPLE/.test(text(by(9))) && text(by(9)).includes('[REDACTED'));
    check(S, '[P8] junction keluar root ditolak', err(10) && !text(by(10)).includes('PROD_SECRET'), text(by(10)));
    check(S, '[P8] search_code tidak mengikuti junction', !text(by(11)).includes('escape/prod.md'), text(by(11)));
    check(S, '[P10] git_status hanya path sandbox', !text(by(12)).includes('README') && text(by(12)).includes('notes.md'), text(by(12)));
    check(S, 'tool tak dikenal -> JSON-RPC -32602', Boolean(by(13).error) && by(13).error.code === -32602);
    check(S, 'batch JSON-RPC dijawab', Boolean(by(14).result && by(15).result));
    const audit = fs.readFileSync(ws.p('audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const ok = audit.length === 8 && audit.some((a) => a.outcome === 'denied') && !JSON.stringify(audit).includes('hunter2');
    check(S, 'audit log: tiap tool call tercatat (termasuk denied), tanpa isi file', ok, `${audit.length} entri`);
  });
}

module.exports = mcpCases;
