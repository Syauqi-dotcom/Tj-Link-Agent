'use strict';

/** Demo end-to-end (green/red/CRLF, regresi P6-P7) + git pre-commit sebagai hard gate. */

const fs = require('node:fs');
const { withWorkspace, check } = require('./harness');

const S = 'demo & pre-commit';
const PRICING = 'sandbox/src/pricing.js';
const TEST = 'sandbox/test/pricing.test.js';

function demoCases() {
  withWorkspace((ws) => {
    const tree0 = ws.git('write-tree').out.trim();
    let r = ws.node(['demo/run-demo.js', '--fast']);
    const green = ws.read('demo/output/REPORT-green.md');
    check(S, 'demo green: exit 0 + laporan ✅ SELESAI', r.code === 0 && green.includes('✅ SELESAI'), `exit=${r.code} ${r.err.slice(0, 120)}`);
    check(S, 'laporan memuat file yang dibaca (dari audit log MCP)', green.includes('src/pricing.js — via MCP `read_file`'));

    r = ws.node(['demo/run-demo.js', '--fast', '--scenario', 'red']);
    const red = ws.read('demo/output/REPORT-red.md');
    check(S, 'demo red: exit 1 + laporan ⛔ BELUM SELESAI', r.code === 1 && red.includes('⛔ BELUM SELESAI'), `exit=${r.code}`);
    const status = ws.git('status', '--porcelain', '--', 'sandbox').out.trim();
    check(S, '[P7] demo tidak menyentuh git index & sandbox pulih', ws.git('write-tree').out.trim() === tree0 && status === '', status || 'bersih');

    const lf = ws.read(TEST);
    ws.write(TEST, lf.replace(/\n/g, '\r\n'));
    r = ws.node(['demo/run-demo.js', '--fast']);
    check(S, '[P6] demo tetap lolos pada working copy CRLF', r.code === 0, `exit=${r.code} ${r.err.slice(0, 120)}`);
    check(S, 'cleanup memulihkan byte asli (CRLF tetap CRLF)', ws.read(TEST).includes('\r\n'));
    ws.write(TEST, lf);

    const hook = ws.p('.git', 'hooks', 'pre-commit');
    fs.copyFileSync(ws.p('githooks', 'pre-commit'), hook);
    fs.chmodSync(hook, 0o755);
    const commit = () => ws.git('-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', 'commit', '-q', '-m', 'uji');
    const orig = ws.read(PRICING);
    ws.write(PRICING, `${orig}const tjlX = 1;   \n`);
    ws.git('add', PRICING);
    r = commit();
    check(S, 'pre-commit MENOLAK commit saat gate merah', r.code !== 0 && ws.git('rev-list', '--count', 'HEAD').out.trim() === '1', (r.err || r.out).split('\n')[0]);
    ws.write(PRICING, `${orig}// catatan valid\n`);
    ws.git('add', PRICING);
    r = commit();
    check(S, 'pre-commit mengizinkan commit saat gate hijau', r.code === 0 && ws.git('rev-list', '--count', 'HEAD').out.trim() === '2', (r.err || r.out).split('\n')[0]);
  });
}

module.exports = demoCases;
