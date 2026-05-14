/**
 * GmailIntakeSource (I/O) — finds candidate MVA certificate emails and pulls
 * their PDF attachments.
 *
 * Certificate emails come from `notifications@missionvistaacademy.org` with a
 * subject like `Enrichment Order {ORDER#} (CERTIFICATE)`. Built in Slice 2 (#3);
 * the go-live-date filter is added in Slice 3 (#4).
 */
const GmailIntakeSource = {
  /**
   * @param {Date} [afterDate] only emails after the go-live date (Slice 3)
   * @returns {Array<object>} candidate certificate email messages
   */
  findCertificateEmails(afterDate) {
    throw new Error('GmailIntakeSource.findCertificateEmails not implemented — Slice 2 (#3)');
  },

  /**
   * @param {object} message a Gmail message
   * @returns {Array<object>} the PDF attachment blobs on that message
   */
  getPdfAttachments(message) {
    throw new Error('GmailIntakeSource.getPdfAttachments not implemented — Slice 2 (#3)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GmailIntakeSource;
}
