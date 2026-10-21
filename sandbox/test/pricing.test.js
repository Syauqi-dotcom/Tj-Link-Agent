'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { calculateSubtotal, calculateTotal } = require('../src/pricing');

test('calculateSubtotal menjumlahkan price * qty', () => {
  const items = [
    { price: 1000, qty: 2 },
    { price: 500, qty: 3 },
  ];
  assert.strictEqual(calculateSubtotal(items), 3500);
});

test('calculateSubtotal mengembalikan 0 untuk array kosong', () => {
  assert.strictEqual(calculateSubtotal([]), 0);
});

test('calculateSubtotal menolak input non-array', () => {
  assert.throws(() => calculateSubtotal(null), TypeError);
});

test('calculateTotal sama dengan subtotal (PoC tanpa PPN)', () => {
  const items = [{ price: 300000, qty: 1 }];
  assert.strictEqual(calculateTotal(items), 300000);
});
