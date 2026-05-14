/**
 * LedgerGateway (I/O) — reads and writes rows on a Student Ledger tab.
 *
 * Stays dumb: no domain logic, just row in / row out. Built in Slice 2 (#3).
 */
const LedgerGateway = {
  /**
   * @param {string} tabName the Student's tab
   * @returns {Array<object>} the ledger rows
   */
  readRows(tabName) {
    throw new Error('LedgerGateway.readRows not implemented — Slice 2 (#3)');
  },

  /**
   * @param {string} tabName the Student's tab
   * @param {object} row the row to append
   */
  appendRow(tabName, row) {
    throw new Error('LedgerGateway.appendRow not implemented — Slice 2 (#3)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LedgerGateway;
}
