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
   *   the year it belongs to. `counter` is the *next* sequence number to issue.
   * @param {number} currentYear the year of the run
   * @returns {{ invoiceNumber: string, state: { year: number, counter: number } }}
   */
  allocate(state, currentYear) {
    const sameYear = Number(state.year) === Number(currentYear);
    const seq = sameYear ? Number(state.counter) : 1;
    const invoiceNumber = currentYear + '-' + pad3_(seq);
    return {
      invoiceNumber: invoiceNumber,
      state: { year: Number(currentYear), counter: seq + 1 },
    };
  },
};

/** Left-pads to at least three digits; longer sequences pass through intact. */
function pad3_(n) {
  const s = String(n);
  return s.length >= 3 ? s : ('00' + s).slice(-3);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceNumberAllocator;
}
