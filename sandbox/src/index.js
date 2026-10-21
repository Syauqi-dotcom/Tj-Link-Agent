'use strict';

/**
 * Entry point demo sandbox TJLINK.
 * Hanya untuk PoC — tidak terhubung ke sistem produksi, database, atau DABN.
 */

const { formatInvoiceNumber } = require('./invoice');
const { calculateTotal } = require('./pricing');

function main() {
  const items = [
    { name: 'Langganan Internet 50Mbps', price: 300000, qty: 1 },
    { name: 'Biaya Instalasi', price: 150000, qty: 1 },
  ];

  const invoiceNo = formatInvoiceNumber('TJL', 2026, 42);
  const total = calculateTotal(items);

  // Output demo sederhana.
  console.log(`Invoice   : ${invoiceNo}`);
  console.log(`Total     : Rp ${total.toLocaleString('id-ID')}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
