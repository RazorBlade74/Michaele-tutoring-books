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
    throw new Error('PoolEngine.coveredBatch not implemented — Slice 4 (#5)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PoolEngine;
}
