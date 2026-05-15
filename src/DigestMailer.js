/**
 * DigestMailer (I/O) — sends the digest as a plain Gmail message to the tutor's
 * inbox. Stays dumb: caller composes the recipient, subject, and body; this
 * just hands them to Gmail. Unlike the invoice mailer, the digest is sent
 * outright (not a draft) — it is informational. Built in Slice 5 (#6).
 */
const DigestMailer = {
  /**
   * @param {{ to: string, subject: string, body: string }} options
   */
  sendDigest(options) {
    GmailApp.sendEmail(options.to, options.subject, options.body);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DigestMailer;
}
