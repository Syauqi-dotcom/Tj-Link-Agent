'use strict';

/**
 * Util pembentukan nomor invoice TJLINK.
 * Format: <PREFIX>-<YEAR>-<SEQUENCE6DIGIT>
 * Contoh: TJL-2026-000042
 */

/**
 * Membentuk nomor invoice yang konsisten.
 *
 * @param {string} prefix  Prefix invoice, mis. "TJL".
 * @param {number} year    Tahun 4 digit, mis. 2026.
 * @param {number} sequence Nomor urut (integer positif).
 * @returns {string} Nomor invoice terformat.
 */
function formatInvoiceNumber(prefix, year, sequence) {
  if (typeof prefix !== 'string' || prefix.trim() === '') {
    throw new TypeError('prefix harus berupa string non-kosong');
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('year harus integer 4 digit yang valid');
  }
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new RangeError('sequence harus integer >= 0');
  }

  const seq = String(sequence).padStart(6, '0');
  return `${prefix.trim().toUpperCase()}-${year}-${seq}`;
}

module.exports = { formatInvoiceNumber };
