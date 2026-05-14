/**
 * Intake — wires the certificate intake path: Gmail -> PDF -> OCR -> parse ->
 * route by Student ID -> write a `Certificate` ledger row.
 *
 * Built in Slice 2 (#3), happy path only: a known student, a readable
 * attachment. Dedup, go-live-date filtering, multi-attachment Orders, and
 * digest-flagging of unreadable/unknown certificates are Slice 3 (#4); the
 * Orchestrator that schedules this run is Slice 5 (#6).
 */

/**
 * Process every candidate MVA certificate email currently in the mailbox.
 *
 * @returns {{
 *   written: Array<{ certificateNumber: string, tabName: string }>,
 *   skipped: Array<{ reason: string, certificateNumber: (string|null) }>
 * }} a summary of what intake did this run
 */
function runIntake() {
  const rosterByStudentId = {};
  ConfigGateway.getRoster().forEach(function (entry) {
    rosterByStudentId[entry.studentId] = entry;
  });

  const result = { written: [], skipped: [] };

  GmailIntakeSource.findCertificateEmails().forEach(function (message) {
    GmailIntakeSource.getPdfAttachments(message).forEach(function (pdfBlob) {
      const ocrText = OcrService.pdfToText(pdfBlob);
      const cert = CertificateParser.parse(ocrText);

      if (cert.amountUnreadable) {
        // Slice 3 (#4) flags this in the digest for manual entry.
        result.skipped.push({ reason: 'amount-unreadable', certificateNumber: null });
        return;
      }

      const studentId = CertificateNumber.parse(cert.certificateNumber).studentId;
      const rosterEntry = rosterByStudentId[studentId];
      if (!rosterEntry) {
        // Slice 3 (#4) flags an unknown Student ID to the tutor.
        result.skipped.push({
          reason: 'unknown-student',
          certificateNumber: cert.certificateNumber,
        });
        return;
      }

      LedgerGateway.appendRow(rosterEntry.tabName, {
        date: cert.dateIssued,
        type: 'Certificate',
        description: cert.classActivity + ' — ' + cert.serviceDates,
        amount: -cert.totalAmount,
        certificateNumber: cert.certificateNumber,
        status: '',
      });
      result.written.push({
        certificateNumber: cert.certificateNumber,
        tabName: rosterEntry.tabName,
      });
    });
  });

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runIntake };
}
