'use strict';

/** Gate: test terkait, cakupan test, evidence FRESH/STALE, Stop hook anti-loop, repo tanpa commit. */

const { withWorkspace, check } = require('./harness');

const S = 'gate evidence';
const PRICING = 'sandbox/src/pricing.js';
const BROKEN = (s) => s.replace('return calculateSubtotal(items);', 'return calculateSubtotal(items) + 1;');

function gateEvidenceCases() {
  withWorkspace((ws) => {
    const orig = ws.read(PRICING);

    ws.write('sandbox/src/discount.js', "'use strict';\nmodule.exports = { discount: (x) => x * 0.9 };\n");
    let r = ws.gate(['--mode', 'final']);
    check(S, 'file src baru tanpa test -> FAIL (SKILL §6)', r.code === 1 && r.err.includes('tidak ada test yang meng-cover'), '');
    ws.remove('sandbox/src/discount.js');

    ws.write(PRICING, orig.replace("'use strict';", "'use strict';\n// perubahan kecil"));
    r = ws.gate(['--mode', 'final']);
    const ev = JSON.parse(ws.read('.kiro/evidence/gate-final.json'));
    const files = ev.testSelection.files.join(', ');
    check(S, 'test terkait dipilih dari require(), bukan seluruh suite', r.code === 0 && files.includes('test/pricing.test.js') && !files.includes('invoice'), files);
    r = ws.gate(['--verify-evidence']);
    check(S, 'evidence FRESH saat kode belum berubah', r.code === 0 && r.out.includes('FRESH'), r.out);
    ws.write(PRICING, `${ws.read(PRICING)}// diubah setelah gate\n`);
    r = ws.gate(['--verify-evidence']);
    check(S, 'evidence STALE setelah kode berubah (klaim basi terdeteksi)', r.code === 1 && r.err.includes('STALE'), r.err);

    ws.write(PRICING, BROKEN(orig));
    const stop = () => ws.gate(['--mode', 'final', '--hook', '--on-stop'], ws.payload('Stop'));
    const outs = [stop(), stop(), stop()].map((x) => x.out.trim());
    const isBlock = (o) => {
      try {
        return JSON.parse(o).decision === 'block';
      } catch {
        return false;
      }
    };
    check(S, 'Stop hook merah: decision=block, agent diminta lanjut', isBlock(outs[0]) && isBlock(outs[1]), outs[0].slice(0, 90));
    check(S, 'Stop hook anti-loop: blokir ke-3 untuk state sama dihentikan', !isBlock(outs[2]) && outs[2].includes('batas pengulangan'), outs[2].slice(0, 90));
    ws.write(PRICING, orig);
    r = stop();
    check(S, 'Stop hook tanpa perubahan: diam, exit 0', r.code === 0 && r.out.trim() === '', `out="${r.out.trim()}"`);

    ws.write('sandbox/docs/architecture.md', `${ws.read('sandbox/docs/architecture.md')}<<<<<<< HEAD\n`);
    r = ws.gate(['--mode', 'final']);
    check(S, 'conflict marker terdeteksi', r.code === 1 && /conflict marker/i.test(r.err), '');
  });

  withWorkspace((ws) => {
    const r = ws.gate(['--mode', 'final']);
    check(S, 'repo tanpa commit (kondisi repo asli): seluruh suite & PASS', r.code === 0 && r.out.includes('seluruh suite'), (r.out || r.err).split('\n')[2]);
  }, { commit: false });
}

module.exports = gateEvidenceCases;
