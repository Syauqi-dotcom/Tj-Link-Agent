'use strict';

/** Gate verifikasi: regresi bug baseline (P1-P5) + deteksi kegagalan dasar. */

const { withWorkspace, check } = require('./harness');

const S = 'gate';
const PRICING = 'sandbox/src/pricing.js';
const line = (s, i) => (s.split('\n')[i] || '').trim();

function gateCases() {
  withWorkspace((ws) => {
    const orig = ws.read(PRICING);
    const reset = () => ws.write(PRICING, orig);

    let r = ws.gate(['--mode', 'final']);
    check(S, 'tree bersih: final PASS, test SKIP (tidak ada perubahan)', r.code === 0 && /\[SKIP\] test/.test(r.out), line(r.out, 2));
    r = ws.gate(['--mode', 'ci']);
    check(S, 'mode ci: seluruh suite PASS', r.code === 0 && /9 pass \/ 0 fail \(seluruh suite\)/.test(r.out), line(r.out, 2));
    check(S, '[P2] output sukses ringkas (< 600 byte)', r.out.length < 600, `${r.out.length} byte`);

    ws.write(PRICING, `${orig}console.log('x');\n`);
    r = ws.gate(['--mode', 'quick', '--hook'], ws.payload('PostToolUse', 'fs_write', { path: PRICING }));
    check(S, '[P1] quick gagal: exit 1, detail di STDERR', r.code === 1 && r.err.includes('console.log'), line(r.err, 1));
    r = ws.gate(['--mode', 'final']);
    check(S, '[P1] final gagal: exit 1, detail di STDERR', r.code === 1 && r.err.includes('GATE GAGAL') && !r.out, line(r.err, 1));
    reset();

    ws.write(PRICING, `${orig}function (\n`);
    r = ws.gate(['--mode', 'quick', '--file', PRICING]);
    check(S, 'quick: syntax error terdeteksi', r.code === 1 && /syntax error/.test(r.err), line(r.err, 1));
    reset();

    ws.write(PRICING, orig.replace('return calculateSubtotal(items);', 'return calculateSubtotal(items) + 1;'));
    r = ws.gate(['--mode', 'final']);
    check(S, 'test terkait gagal -> FAIL', r.code === 1 && /\[FAIL\] test/.test(r.err), line(r.err, 2));
    reset();

    ws.write(PRICING, `${orig}const tjlStaged = 1;   \n`);
    ws.git('add', PRICING);
    r = ws.gate(['--mode', 'final']);
    check(S, '[P3] whitespace error yang sudah di-stage terdeteksi', r.code === 1 && r.err.includes('[staged]'), '');
    ws.git('restore', '--staged', PRICING);
    reset();

    ws.write('sandbox/src/extra.js', "'use strict';\nconst tjlNew = 2;   \n");
    r = ws.gate(['--mode', 'final']);
    check(S, '[P4] whitespace error di file untracked terdeteksi', r.code === 1 && r.err.includes('[untracked] sandbox/src/extra.js'), '');
    ws.remove('sandbox/src/extra.js');

    ws.write('sandbox/src/utils/bad.js', "console.log('tanpa use strict');\n");
    r = ws.gate(['--mode', 'final']);
    check(S, '[P5] lint rekursif: pelanggaran di subfolder terdeteksi', r.code === 1 && r.err.includes('src/utils/bad.js'), '');
    ws.remove('sandbox/src/utils');
  });
}

module.exports = gateCases;
