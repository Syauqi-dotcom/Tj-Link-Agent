'use strict';

/**
 * Util perhitungan harga untuk sandbox TJLINK.
 */

/**
 * Menghitung subtotal dari daftar item.
 *
 * @param {Array<{price:number, qty:number}>} items Daftar item.
 * @returns {number} Subtotal (price * qty dijumlahkan).
 */
function calculateSubtotal(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('items harus berupa array');
  }

  return items.reduce((sum, item) => {
    if (typeof item.price !== 'number' || typeof item.qty !== 'number') {
      throw new TypeError('setiap item harus punya price dan qty bertipe number');
    }
    return sum + item.price * item.qty;
  }, 0);
}

/**
 * Menghitung total akhir (subtotal saja untuk PoC; PPN belum diterapkan).
 *
 * @param {Array<{price:number, qty:number}>} items Daftar item.
 * @returns {number} Total akhir.
 */
function calculateTotal(items) {
  return calculateSubtotal(items);
}

module.exports = { calculateSubtotal, calculateTotal };
