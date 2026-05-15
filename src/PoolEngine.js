/**
 * PoolEngine (pure) — the core domain module.
 *
 * Input: a Student's ledger rows. Output: the Covered Batch — the contiguous
 * prefix of uninvoiced Certificates (ordered by `seq`) that the Session Pool
 * fully covers in this run. Strict-FIFO, no skip-ahead. Built in Slice 4 (#5).
 */
const PoolEngine = {
  /**
   * @param {Array<{
   *   date: Date|string,
   *   type: string,
   *   description: string,
   *   amount: number,
   *   certificateNumber: string,
   *   status: string
   * }>} ledgerRows all rows from one Student Ledger tab
   * @returns {Array<object>} the Covered Batch: uninvoiced Certificate rows the
   *   pool fully covers this run, ordered by `seq` ascending. Empty if none.
   */
  coveredBatch(ledgerRows) {
    let poolCents = 0;
    const certificateRows = [];
    const invoicedCertNumbers = {};

    ledgerRows.forEach(function (row) {
      const type = String(row.type).trim();
      if (type === 'Session') {
        poolCents += cents_(row.amount);
      } else if (type === 'Certificate') {
        certificateRows.push(row);
      } else if (type === 'Invoice' && row.certificateNumber) {
        invoicedCertNumbers[row.certificateNumber] = true;
      }
    });

    // An already-invoiced Certificate has already drawn its cost out of the
    // pool; it does not re-enter the draw-down, but the pool it consumed is
    // gone. Certificate amounts are negative, so this subtracts.
    let drawableCents = poolCents;
    const uninvoiced = [];
    certificateRows.forEach(function (row) {
      if (invoicedCertNumbers[row.certificateNumber]) {
        drawableCents += cents_(row.amount);
      } else {
        uninvoiced.push(row);
      }
    });

    uninvoiced.sort(function (a, b) {
      return (
        CertificateNumber.parse(a.certificateNumber).seq -
        CertificateNumber.parse(b.certificateNumber).seq
      );
    });

    const batch = [];
    for (let i = 0; i < uninvoiced.length; i++) {
      const costCents = Math.abs(cents_(uninvoiced[i].amount));
      if (drawableCents < costCents) break; // strict FIFO — no skip-ahead
      batch.push(uninvoiced[i]);
      drawableCents -= costCents;
    }
    return batch;
  },
};

/** A dollar amount as integer cents — keeps coverage comparisons exact. */
function cents_(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PoolEngine;
}
