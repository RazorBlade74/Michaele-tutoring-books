/**
 * CertCheck (pure) — cross-checks an extracted Certificate before Intake
 * writes it to the ledger (Slice 12, #25).
 *
 * CertExtractor reads what's printed; this module asks whether what was read
 * adds up: every field present, a well-formed Certificate Number, dollar
 * amounts that are whole cents with a total over $0, a total that is a whole
 * number of units plus the materials fee, a student name matching the
 * roster's Cert Name, and a DATE ISSUED that is a real calendar date. A
 * failed check holds the Certificate back — nothing is guessed — and since
 * every run re-reads the certificate emails, it is entered on the first run
 * after its cause is fixed.
 *
 * Each problem is a sentence Intake shows the tutor verbatim: keep them plain
 * English, and say what to do next. Top-level names are prefixed: Apps Script
 * shares one global scope across every file.
 */
const CERT_CHECK_HAND_ENTER_STEP = "Check the PDF; if it's right, enter it by hand.";
const CERT_CHECK_TEXT_LABELS = {
  studentName: 'STUDENT NAME',
  classActivity: 'CLASS/ACTIVITY',
  serviceDates: 'SERVICE DATE(S)',
  dateIssued: 'DATE ISSUED',
};
const CERT_CHECK_MONEY_LABELS = {
  totalAmount: 'TOTAL AMOUNT',
  amountPerUnit: 'AMOUNT PER UNIT',
  materialsFee: 'MATERIALS FEE',
};

const CertCheck = {
  /**
   * @param {{
   *   certificateNumber: string,
   *   studentName: string,
   *   classActivity: string,
   *   serviceDates: string,
   *   dateIssued: string,
   *   totalAmount: number,
   *   amountPerUnit: number,
   *   materialsFee: number
   * }} cert as returned by CertExtractor.extract
   * @param {string} rosterCertName the roster's Cert Name for the Student ID
   *   the Certificate Number routes to
   * @returns {Array<string>} one plain-English sentence per failed check,
   *   each ending with what to do; empty when the Certificate may be written
   */
  problems(cert, rosterCertName) {
    let studentId;
    try {
      studentId = CertificateNumber.parse(cert.certificateNumber).studentId;
    } catch (e) {
      // Without a Student ID there is no roster row to check against.
      return [
        'Certificate "' +
          certCheckText_(cert.certificateNumber) +
          "\" doesn't have a valid MVA certificate number (MVA-{student ID}-C{number}). " +
          CERT_CHECK_HAND_ENTER_STEP,
      ];
    }

    const subject = 'Certificate ' + certCheckText_(cert.certificateNumber);
    const problems = [];
    function holdBack(why) {
      problems.push(subject + ' ' + why + '. ' + CERT_CHECK_HAND_ENTER_STEP);
    }

    Object.keys(CERT_CHECK_TEXT_LABELS).forEach(function (field) {
      if (!certCheckText_(cert[field])) holdBack('has no ' + CERT_CHECK_TEXT_LABELS[field]);
    });

    const dateIssued = certCheckText_(cert.dateIssued);
    if (dateIssued && !certCheckIsCalendarDate_(dateIssued)) {
      holdBack('has a DATE ISSUED of "' + dateIssued + "\", which isn't a real calendar date");
    }

    const malformed = Object.keys(CERT_CHECK_MONEY_LABELS).filter(function (field) {
      return !certCheckIsDollars_(cert[field]);
    });
    malformed.forEach(function (field) {
      holdBack('has a ' + CERT_CHECK_MONEY_LABELS[field] + ' of "' + cert[field] + "\", which isn't a dollar amount");
    });
    if (malformed.length === 0) {
      // Compare in integer cents: 3 × $0.10 + $0.20 is not $0.50 in floating point.
      const total = certCheckCents_(cert.totalAmount);
      const perUnit = certCheckCents_(cert.amountPerUnit);
      const units = total - certCheckCents_(cert.materialsFee);
      // TOTAL AMOUNT = n × AMOUNT PER UNIT + MATERIALS FEE for a whole n ≥ 1.
      const wholeUnits = perUnit === 0 ? units === 0 : units >= perUnit && units % perUnit === 0;
      if (total === 0) {
        holdBack('has a TOTAL AMOUNT of $0.00; an approved certificate is always for more than $0');
      } else if (!wholeUnits) {
        holdBack(
          'has a TOTAL AMOUNT of ' +
            certCheckMoney_(cert.totalAmount) +
            ", which isn't a whole number of AMOUNT PER UNIT (" +
            certCheckMoney_(cert.amountPerUnit) +
            ') plus MATERIALS FEE (' +
            certCheckMoney_(cert.materialsFee) +
            ')'
        );
      }
    }

    // Routing is by Student ID; the name check catches misreads and roster drift.
    const certName = certCheckText_(cert.studentName);
    const rosterName = certCheckText_(rosterCertName);
    if (certName && !rosterName) {
      problems.push(
        subject +
          ' says "' +
          certName +
          '" but the roster has no Cert Name for Student ID ' +
          studentId +
          '. If the certificate is right, enter "' +
          certName +
          '" as Cert Name on the Config tab.'
      );
    } else if (certName && certName.toLowerCase() !== rosterName.toLowerCase()) {
      problems.push(
        subject +
          ' says "' +
          certName +
          '" but the roster says "' +
          rosterName +
          '". If the certificate is right, update Cert Name on the Config tab.'
      );
    }

    return problems;
  },
};

// Trimmed, with runs of whitespace collapsed to one space.
function certCheckText_(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
}

// MVA prints DATE ISSUED as M/D/YYYY.
function certCheckIsCalendarDate_(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// A non-negative number of whole cents.
function certCheckIsDollars_(amount) {
  return (
    typeof amount === 'number' &&
    isFinite(amount) &&
    amount >= 0 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
  );
}

function certCheckCents_(amount) {
  return Math.round(amount * 100);
}

function certCheckMoney_(amount) {
  return '$' + amount.toFixed(2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertCheck;
}
