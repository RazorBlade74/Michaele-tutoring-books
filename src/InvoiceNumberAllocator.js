/**
 * InvoiceNumberAllocator (pure) — allocates clean global invoice numbers.
 *
 * Given the current counter value and the current year, returns the next
 * `{YYYY}-{NNN}` number and the new counter value, resetting the sequence when
 * the year rolls over. Built in Slice 4 (#5).
 */
const InvoiceNumberAllocator = {
  /**
   * @param {{ year: number, counter: number }} state the persisted counter and
   *   the year it belongs to
   * @param {number} currentYear the year of the run
   * @returns {{ invoiceNumber: string, state: { year: number, counter: number } }}
   */
  allocate(state, currentYear) {
    throw new Error('InvoiceNumberAllocator.allocate not implemented — Slice 4 (#5)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceNumberAllocator;
}
