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
   * @param {Date} [afterDate] only emails after the go-live date (Slice 3 — the
   *   parameter is accepted now but not yet applied)
   * @returns {Array<GoogleAppsScript.Gmail.GmailMessage>} candidate certificate
   *   email messages
   */
  findCertificateEmails(afterDate) {
    const query =
      'from:notifications@missionvistaacademy.org subject:(CERTIFICATE) has:attachment';
    const messages = [];
    GmailApp.search(query).forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        if (/Enrichment Order .+ \(CERTIFICATE\)/i.test(message.getSubject())) {
          messages.push(message);
        }
      });
    });
    return messages;
  },

  /**
   * @param {GoogleAppsScript.Gmail.GmailMessage} message a Gmail message
   * @returns {Array<GoogleAppsScript.Base.Blob>} the PDF attachment blobs on
   *   that message
   */
  getPdfAttachments(message) {
    return message.getAttachments().filter(function (attachment) {
      return (
        attachment.getContentType() === 'application/pdf' ||
        /\.pdf$/i.test(attachment.getName())
      );
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GmailIntakeSource;
}
