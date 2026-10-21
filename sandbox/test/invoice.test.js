'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { formatInvoiceNumber } = require('../src/invoice');

test('formatInvoiceNumber membentuk format standar', () => {
  assert.strictEqual(formatInvoiceNumber('TJL', 2026, 42), 'TJL-2026-000042');
});

test('formatInvoiceNumber meng-uppercase dan trim prefix', () => {
  assert.strictEqual(formatInvoiceNumber('  tjl ', 2026, 1), 'TJL-2026-000001');
});

test('formatInvoiceNumber menolak prefix kosong', () => {
  assert.throws(() => formatInvoiceNumber('', 2026, 1), TypeError);
});

test('formatInvoiceNumber menolak year tidak valid', () => {
  assert.throws(() => formatInvoiceNumber('TJL', 99, 1), RangeError);
});

test('formatInvoiceNumber menolak sequence negatif', () => {
  assert.throws(() => formatInvoiceNumber('TJL', 2026, -1), RangeError);
});
