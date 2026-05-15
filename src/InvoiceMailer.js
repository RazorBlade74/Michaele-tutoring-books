/**
 * InvoiceMailer (I/O) — creates the Gmail draft of an invoice email with the
 * invoice PDF attached. Stays dumb: the caller composes the recipient, subject,
 * and body; this just hands them to Gmail as a draft for the tutor to review
 * and send. Built in Slice 4 (#5).
 */
const InvoiceMailer = {
  /**
   * @param {{
   *   to: string,
   *   subject: string,
   *   body: string,
   *   pdfBlob: GoogleAppsScript.Base.Blob
   * }} options
   * @returns {GoogleAppsScript.Gmail.GmailDraft} the created draft
   */
  draftInvoice(options) {
    return GmailApp.createDraft(options.to, options.subject, options.body, {
      attachments: [options.pdfBlob],
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceMailer;
}
