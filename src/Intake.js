/**
 * Intake — wires the certificate intake path: Gmail -> PDF -> extract ->
 * route by Student ID -> write a `Certificate` ledger row.
 *
 * Slice 3 (#4) thickens the path for the real world: it iterates every PDF
 * attachment on an Order, dedups by Certificate Number against the Student
 * Ledger (and within the run), skips emails dated on/before the Config go-live
 * date, and collects unknown-student / unreadable-amount / extraction-failed
 * attachments as flagged items instead of crashing or writing bad rows. The
 * Orchestrator that schedules this run — and the digest that consumes the
 * flagged items — is Slice 5 (#6). Slice 8 swapped the OCR-then-regex extract
 * step for a single CertExtractor call that hits Gemini directly.
 */

/**
 * Process every candidate MVA certificate email dated after the go-live date.
 *
 * @returns {{
 *   entered: Array<{ certificateNumber: string, tabName: string }>,
 *   flagged: Array<{
 *     reason: string,
 *     certificateNumber: (string|null),
 *     studentId: (string|null),
 *     attachmentName: string
 *   }>
 * }} what intake wrote, and what it set aside for the digest
 */
function runIntake() {
  const rosterByStudentId = {};
  ConfigGateway.getRoster().forEach(function (entry) {
    rosterByStudentId[entry.studentId] = entry;
  });

  const goLiveDate = ConfigGateway.getInvoiceSettings().goLiveDate;

  const result = { entered: [], flagged: [] };

  // Certificate Numbers already present on each Student tab — seeded lazily
  // from the ledger, then extended as this run writes. Makes a Certificate
  // written at most once even when Gmail surfaces the same Order email several
  // times in one run, and is the backstop for migration rows carried over by
  // hand.
  const seenByTab = {};
  function seenCertNumbers(tabName) {
    if (!seenByTab[tabName]) {
      const seen = {};
      LedgerGateway.readRows(tabName).forEach(function (row) {
        if (row.certificateNumber) seen[row.certificateNumber] = true;
      });
      seenByTab[tabName] = seen;
    }
    return seenByTab[tabName];
  }

  GmailIntakeSource.findCertificateEmails(goLiveDate).forEach(function (message) {
    GmailIntakeSource.getPdfAttachments(message).forEach(function (pdfBlob) {
      let cert;
      try {
        cert = CertExtractor.extract(pdfBlob);
      } catch (e) {
        // Gemini call failed (missing key, HTTP error, unexpected shape) or the
        // returned cert number isn't well-formed. Surface to the digest so the
        // tutor can hand-enter, instead of crashing the whole run.
        result.flagged.push({
          reason: 'extraction-failed',
          certificateNumber: null,
          studentId: null,
          attachmentName: pdfBlob.getName(),
        });
        return;
      }

      if (cert.amountUnreadable) {
        result.flagged.push({
          reason: 'amount-unreadable',
          certificateNumber: null,
          studentId: null,
          attachmentName: pdfBlob.getName(),
        });
        return;
      }

      let studentId;
      try {
        studentId = CertificateNumber.parse(cert.certificateNumber).studentId;
      } catch (e) {
        result.flagged.push({
          reason: 'extraction-failed',
          certificateNumber: cert.certificateNumber || null,
          studentId: null,
          attachmentName: pdfBlob.getName(),
        });
        return;
      }
      const rosterEntry = rosterByStudentId[studentId];
      if (!rosterEntry) {
        result.flagged.push({
          reason: 'unknown-student',
          certificateNumber: cert.certificateNumber,
          studentId: studentId,
          attachmentName: pdfBlob.getName(),
        });
        return;
      }

      const seen = seenCertNumbers(rosterEntry.tabName);
      if (seen[cert.certificateNumber]) return; // already on the ledger — skip silently

      LedgerGateway.appendRow(rosterEntry.tabName, {
        date: cert.dateIssued,
        type: 'Certificate',
        description: cert.classActivity + ' — ' + cert.serviceDates,
        amount: -cert.totalAmount,
        certificateNumber: cert.certificateNumber,
        status: '',
      });
      seen[cert.certificateNumber] = true;
      result.entered.push({
        certificateNumber: cert.certificateNumber,
        tabName: rosterEntry.tabName,
      });
    });
  });

  return result;
}

// In Apps Script every .gs file shares one global scope, so the Orchestrator
// references this module as `Intake.runIntake()`. Wrap the top-level function
// in an `Intake` object to match the convention every other module uses.
const Intake = { runIntake: runIntake };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Intake: Intake, runIntake: runIntake };
}
