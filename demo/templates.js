'use strict';

/** Perubahan demo TJL-DEMO-001 sebagai edit minimal (find -> replace), seperti str_replace agent. */

const SUBTOTAL_DOC = '/**\n * Menghitung subtotal dari daftar item.';

function pricingEdits(scenario) {
  const total =
    scenario === 'red'
      ? '  return subtotal * (1 + PPN_RATE); // BUG demo: lupa pembulatan ke rupiah'
      : '  return Math.round(subtotal * (1 + PPN_RATE));';
  return [
    [SUBTOTAL_DOC, `/** Tarif PPN yang berlaku (11%). */\nconst PPN_RATE = 0.11;\n\n${SUBTOTAL_DOC}`],
    [' * Menghitung total akhir (subtotal saja untuk PoC; PPN belum diterapkan).',
      ' * Menghitung total akhir termasuk PPN 11%, dibulatkan ke rupiah terdekat.'],
    ['  return calculateSubtotal(items);\n}', `  const subtotal = calculateSubtotal(items);\n${total}\n}`],
    ['module.exports = { calculateSubtotal, calculateTotal };',
      'module.exports = { calculateSubtotal, calculateTotal, PPN_RATE };'],
  ];
}

const TEST_EDITS = [[
  "test('calculateTotal sama dengan subtotal (PoC tanpa PPN)', () => {\n  const items = [{ price: 300000, qty: 1 }];\n  assert.strictEqual(calculateTotal(items), 300000);\n});",
  "test('calculateTotal menambahkan PPN 11% ke subtotal', () => {\n  const items = [{ price: 300000, qty: 1 }];\n  assert.strictEqual(calculateTotal(items), 333000); // 300000 + 11%\n});",
]];

const PPN_TEST = [
  "'use strict';", '',
  "const { test } = require('node:test');",
  "const assert = require('node:assert');",
  "const { calculateTotal, calculateSubtotal, PPN_RATE } = require('../src/pricing');", '',
  "test('PPN_RATE adalah 11%', () => assert.strictEqual(PPN_RATE, 0.11));", '',
  "test('calculateTotal = subtotal + PPN 11% (dibulatkan)', () => {",
  '  const items = [{ price: 300000, qty: 1 }, { price: 150000, qty: 1 }];',
  '  assert.strictEqual(calculateSubtotal(items), 450000);',
  '  assert.strictEqual(calculateTotal(items), 499500);',
  '});', '',
  "test('calculateTotal membulatkan ke rupiah terdekat', () => {",
  '  assert.strictEqual(calculateTotal([{ price: 101, qty: 1 }]), 112); // 112.11 -> 112',
  '});', '',
].join('\n');

/** Terapkan edit; gagal keras bila anchor tidak ditemukan (tidak ada perubahan diam-diam). */
function applyEdits(content, edits, label) {
  let out = content.replace(/\r\n/g, '\n'); // aman untuk checkout CRLF maupun LF
  for (const [find, repl] of edits) {
    if (!out.includes(find)) throw new Error(`anchor edit tidak ditemukan di ${label}: ${find.split('\n')[0]}`);
    out = out.replace(find, () => repl);
  }
  return out;
}

module.exports = { pricingEdits, TEST_EDITS, PPN_TEST, applyEdits };
