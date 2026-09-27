/**
 * CertExtractor — PDF blob to structured Certificate, read straight from the
 * PDF's own text (Slice 11, #24; ADR 0004). No AI, no API key, no OCR.
 *
 * MVA certificates come from one fixed iText template whose every field is
 * real text: a label block (`TOTAL AMOUNT:`) with its value block on the same
 * row, to its right. Exact positions shift between certificates (a logo
 * pushes rows around), so we match by label and row, never by fixed
 * coordinates. Anything off-template — a missing or doubled label, a blank
 * value, an amount that isn't `$N.NN` — throws a message naming the label,
 * which Intake shows the tutor. It never guesses and never returns a partial
 * Certificate.
 *
 * Thrown messages start `CertExtractor: ` followed by a phrase Intake quotes
 * to the tutor verbatim: keep them plain English.
 */

// Labels as printed on the certificate, without the trailing colon.
const CERT_TEXT_FIELDS = {
  certificateNumber: 'CERTIFICATE NUMBER',
  studentName: 'STUDENT NAME',
  classActivity: 'CLASS/ACTIVITY',
  serviceDates: 'SERVICE DATE(S)',
  dateIssued: 'DATE ISSUED',
};
const CERT_MONEY_FIELDS = {
  totalAmount: 'TOTAL AMOUNT',
  amountPerUnit: 'AMOUNT PER UNIT',
  materialsFee: 'MATERIALS FEE',
};
// Same row = baselines within this many points.
const CERT_ROW_TOLERANCE = 0.5;

const CertExtractor = {
  /**
   * @param {GoogleAppsScript.Base.Blob} pdfBlob a PDF attachment blob
   * @returns {{
   *   certificateNumber: string,
   *   studentName: string,
   *   classActivity: string,
   *   serviceDates: string,
   *   dateIssued: string,
   *   totalAmount: number,
   *   amountPerUnit: number,
   *   materialsFee: number
   * }}
   * @throws when the PDF can't be read or a field is missing or malformed —
   *   Intake catches and flags these.
   */
  extract(pdfBlob) {
    let runs;
    try {
      runs = PdfText.textRuns(pdfBlob.getBytes());
    } catch (e) {
      throw new Error("CertExtractor: couldn't read the PDF's text (" + e.message + ')');
    }

    const cert = {};
    Object.keys(CERT_TEXT_FIELDS).forEach(function (field) {
      cert[field] = CertExtractor.valueRightOf(runs, CERT_TEXT_FIELDS[field]);
    });
    Object.keys(CERT_MONEY_FIELDS).forEach(function (field) {
      cert[field] = certParseMoney_(CERT_MONEY_FIELDS[field], CertExtractor.valueRightOf(runs, CERT_MONEY_FIELDS[field]));
    });
    return cert;
  },

  /**
   * The text printed to the right of `label` on the same row — the nearest
   * run, which must not itself be another label.
   *
   * @param {Array<{ x: number, y: number, text: string }>} runs from PdfText
   * @param {string} label as printed, without the trailing colon
   * @returns {string} the value, trimmed
   * @throws when the label is missing, doubled, or has no value beside it
   */
  valueRightOf(runs, label) {
    const labelRuns = runs.filter(function (run) {
      return run.text.trim() === label + ':';
    });
    if (labelRuns.length === 0) {
      throw new Error('CertExtractor: the "' + label + '" label wasn\'t found on the certificate');
    }
    if (labelRuns.length > 1) {
      throw new Error('CertExtractor: the "' + label + '" label appears more than once on the certificate');
    }
    const at = labelRuns[0];

    let nearest = null;
    runs.forEach(function (run) {
      if (Math.abs(run.y - at.y) > CERT_ROW_TOLERANCE || run.x <= at.x || !run.text.trim()) return;
      if (!nearest || run.x < nearest.x) nearest = run;
    });
    // An all-caps phrase ending in a colon is the next label along the row.
    if (!nearest || /^[A-Z][A-Z0-9 /()&-]*:$/.test(nearest.text.trim())) {
      throw new Error('CertExtractor: the "' + label + '" label has no value next to it on the certificate');
    }
    return nearest.text.trim();
  },
};

function certParseMoney_(label, text) {
  if (!/^\$\s?(\d{1,3}(,\d{3})+|\d+)(\.\d{2})?$/.test(text)) {
    throw new Error('CertExtractor: the "' + label + '" value "' + text + '" isn\'t a dollar amount');
  }
  return Number(text.replace(/[$,\s]/g, ''));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertExtractor;
}
