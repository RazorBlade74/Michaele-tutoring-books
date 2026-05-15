/**
 * GmailIntakeSource (I/O) — finds candidate MVA certificate emails and pulls
 * their PDF attachments.
 *
 * Certificate emails come from `notifications@missionvistaacademy.org` with a
 * subject like `Enrichment Order {ORDER#} (CERTIFICATE)`. Built in Slice 2 (#3);
 * Slice 3 (#4) applies the go-live-date filter.
 */
const GmailIntakeSource = {
  /**
   * @param {Date} [afterDate] the Config go-live date — messages dated on or
   *   before it are excluded, so intake never re-enters certificates carried
   *   over by hand at migration. Omitted: every certificate email is returned.
   * @returns {Array<GoogleAppsScript.Gmail.GmailMessage>} candidate certificate
   *   email messages
   */
  findCertificateEmails(afterDate) {
    let query =
      'from:notifications@missionvistaacademy.org subject:(CERTIFICATE) has:attachment';
    if (afterDate) {
      query += ' after:' + gmailDate_(afterDate);
    }
    const messages = [];
    GmailApp.search(query).forEach(function (thread) {
      thread.getMessages().forEach(function (message) {
        if (!/Enrichment Order .+ \(CERTIFICATE\)/i.test(message.getSubject())) {
          return;
        }
        if (afterDate && message.getDate() <= afterDate) {
          return; // on/before the go-live date — carried over at migration
        }
        messages.push(message);
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

/**
 * The `Date` formatted for Gmail's `after:` operator (`YYYY/MM/DD`), backed off
 * one day: the operator is day-granular and timezone-sensitive, so the bound is
 * kept loose and `findCertificateEmails` re-checks each message's exact date.
 */
function gmailDate_(date) {
  const d = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GmailIntakeSource;
}
