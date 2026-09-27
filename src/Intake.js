/**
 * Intake — wires the certificate intake path: Gmail -> PDF -> extract ->
 * route by Student ID -> write a `Certificate` ledger row.
 *
 * Slice 3 (#4) thickens the path for the real world: it iterates every PDF
 * attachment on an Order, dedups by Certificate Number against the Student
 * Ledger (and within the run), skips emails dated on/before the Config go-live
 * date, and collects unknown-student / extraction-failed attachments as
 * flagged items instead of crashing or writing bad rows. The
 * Orchestrator that schedules this run — and the digest that consumes the
 * flagged items — is Slice 5 (#6). Slice 10 (#23) gives every flagged item a
 * plain-English `detail` — why it was set aside and what the tutor should do
 * next — derived from the thrown error when extraction fails. Slice 11 (#24)
 * reads the certificate straight from the PDF's text (ADR 0004), so a failed
 * read names the label that was missing or malformed.
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
 *     attachmentName: string,
 *     detail: string
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
        // The PDF didn't match the certificate template (a label missing or
        // malformed) or couldn't be read at all. Surface to the digest so the
        // tutor can hand-enter, instead of crashing the whole run.
        result.flagged.push({
          reason: 'extraction-failed',
          certificateNumber: null,
          studentId: null,
          attachmentName: pdfBlob.getName(),
          detail: describeExtractionError_(pdfBlob.getName(), e),
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
          detail: describeBadCertificateNumber_(pdfBlob.getName(), cert.certificateNumber),
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
          detail: describeUnknownStudent_(studentId, cert, pdfBlob.getName()),
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

// Plain-English flag details (Slice 10, #23). Nothing is written for a
// flagged attachment and every run re-reads the certificate emails, so a flag
// clears itself once its cause is fixed. Top-level names are prefixed: Apps
// Script shares one global scope across every file.
const INTAKE_HAND_ENTER_STEP = 'Open the PDF and enter it by hand.';
const INTAKE_MAX_ERROR_TEXT = 200;

function couldNotRead_(attachmentName, why) {
  return "Couldn't read " + attachmentName + ': ' + why;
}

function describeBadCertificateNumber_(attachmentName, certificateNumber) {
  return couldNotRead_(
    attachmentName,
    (certificateNumber
      ? 'the Certificate Number came back as "' +
        certificateNumber +
        '", which isn\'t a valid MVA certificate number. '
      : 'no Certificate Number was found on it. ') + INTAKE_HAND_ENTER_STEP
  );
}

/**
 * Spells out the Config-tab roster row (and the Student tab) the tutor must
 * add, using the values straight off the certificate.
 */
function describeUnknownStudent_(studentId, cert, attachmentName) {
  return (
    'Student ID ' +
    studentId +
    ' (' +
    cert.certificateNumber +
    ', ' +
    attachmentName +
    ") isn't on the roster. On the Config tab, add a roster row — Student ID: " +
    studentId +
    (cert.studentName ? ', Cert Name: ' + cert.studentName : '') +
    ', a Tab Name (e.g. their first name), Active?: Yes. Then create a tab with ' +
    'that Tab Name whose first row has the headings Date, Type, Description, ' +
    'Amount, Certificate Number, Status. The next run will pick it up.'
  );
}

/**
 * Translate a CertExtractor failure into a sentence the tutor can act on.
 * CertExtractor's own messages (`CertExtractor: the "TOTAL AMOUNT" label
 * wasn't found on the certificate`) are already plain English and are quoted
 * as-is; anything else (a bug, an Apps Script timeout) is wrapped.
 *
 * @param {string} attachmentName the PDF that couldn't be read
 * @param {*} error what CertExtractor threw
 * @returns {string} plain-English detail for the digest
 */
function describeExtractionError_(attachmentName, error) {
  const message = String((error && error.message) || error || '');
  const fromReader = /^CertExtractor:\s*/.test(message);

  let text = message.replace(/^CertExtractor:\s*/, '');
  if (text.length > INTAKE_MAX_ERROR_TEXT) text = text.slice(0, INTAKE_MAX_ERROR_TEXT) + '…';
  if (fromReader && text) {
    return couldNotRead_(attachmentName, text + '. ' + INTAKE_HAND_ENTER_STEP);
  }
  return couldNotRead_(
    attachmentName,
    'something went wrong while reading it (' +
      (text || 'no error message') +
      '). ' +
      INTAKE_HAND_ENTER_STEP
  );
}

// In Apps Script every .gs file shares one global scope, so the Orchestrator
// references this module as `Intake.runIntake()`. Wrap the top-level function
// in an `Intake` object to match the convention every other module uses.
const Intake = { runIntake: runIntake };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Intake: Intake, runIntake: runIntake };
}
