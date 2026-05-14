/**
 * DigestBuilder (pure) — turns a run result into the digest email.
 *
 * Two sections: certificates entered, invoices drafted (plus flagged
 * certificates). Produces no output when nothing happened. Built in Slice 5 (#6).
 */
const DigestBuilder = {
  /**
   * @param {{
   *   certificatesEntered: Array<object>,
   *   certificatesFlagged: Array<object>,
   *   invoicesDrafted: Array<object>
   * }} runResult
   * @returns {{ subject: string, body: string } | null} null when nothing happened
   */
  build(runResult) {
    throw new Error('DigestBuilder.build not implemented — Slice 5 (#6)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DigestBuilder;
}
