/**
 * ConfigGateway (I/O) — reads the roster and invoice settings from the Config
 * tab; persists the invoice counter.
 *
 * Roster lookup is built in Slice 2 (#3); invoice settings + counter
 * persistence are extended in Slice 4 (#5).
 */
const ConfigGateway = {
  /**
   * @returns {Array<{ studentId: string, certName: string, tabName: string, active: boolean }>}
   */
  getRoster() {
    throw new Error('ConfigGateway.getRoster not implemented — Slice 2 (#3)');
  },

  /**
   * @returns {object} vendor/business details, invoicing email, default
   *   line-item description, go-live date
   */
  getInvoiceSettings() {
    throw new Error('ConfigGateway.getInvoiceSettings not implemented — Slice 4 (#5)');
  },

  /**
   * @returns {{ year: number, counter: number }}
   */
  getInvoiceCounter() {
    throw new Error('ConfigGateway.getInvoiceCounter not implemented — Slice 4 (#5)');
  },

  /**
   * @param {{ year: number, counter: number }} state
   */
  setInvoiceCounter(state) {
    throw new Error('ConfigGateway.setInvoiceCounter not implemented — Slice 4 (#5)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfigGateway;
}
