/**
 * CertificateParser (pure) — OCR'd certificate text to a structured Certificate.
 *
 * Returns an explicit "amount unreadable" signal when `TOTAL AMOUNT` can't be
 * confidently extracted or is $0. Built in Slice 2 (#3).
 *
 * The certificate is a fixed-template PDF with a two-column header. Drive's
 * OCR conversion linearises it, often interleaving the right-hand money column
 * onto the same lines as the left column, so extraction is label-anchored and
 * order-independent rather than line- or position-based.
 */

// Every `LABEL:` printed on the certificate template. A field's value runs
// from its own label to whichever other label comes next in the OCR'd text.
const LABELS = [
  'CERTIFICATE NUMBER',
  'AMOUNT PER UNIT',
  'STUDENT NAME',
  'MATERIALS FEE',
  'SCHOOL NAME',
  'TOTAL AMOUNT',
  'VENDOR NAME',
  'CLASS/ACTIVITY',
  'SERVICE UNIT',
  'NOTES',
  'SERVICE DATE(S)',
  'ORDER NUMBER',
  'ENRICHMENT SPECIALIST',
  'DATE ISSUED',
  'EMAIL',
  'CANCELLATION REQUIRED BY',
];

// Section headings that sit between the field blocks (no trailing colon). They
// also terminate a field value — without them, SERVICE DATE(S) would swallow
// the whole notices block up to the next labelled field.
const SECTION_HEADINGS = [
  'SERVICES MAY NOT EXCEED',
  'PARENT NOTICE',
  'VENDOR NOTICE',
  'COVID NOTICE',
  'CANCELLATIONS & REFUNDS',
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Value of `label`: the text after `label:` up to the next field label or
 * section heading (or the end of the text). Whitespace is collapsed. Returns
 * null if the label is absent or its value is empty.
 */
function fieldValue(text, label) {
  const labelStop = LABELS.filter((l) => l !== label)
    .map((l) => `${escapeRegExp(l)}\\s*:`)
    .join('|');
  const sectionStop = SECTION_HEADINGS.map(escapeRegExp).join('|');
  const re = new RegExp(
    `${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?)\\s*(?:${labelStop}|${sectionStop}|$)`,
    'i'
  );
  const match = re.exec(text);
  if (!match) return null;
  const value = match[1].trim().replace(/\s+/g, ' ');
  return value === '' ? null : value;
}

/** Parse a money string like "$375.00" or "1,250" to a number; null if none. */
function parseAmount(raw) {
  if (raw == null) return null;
  const match = /\$?\s*([\d,]+(?:\.\d{1,2})?)/.exec(raw);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

const CertificateParser = {
  /**
   * @param {string} ocrText the OCR'd text of one certificate PDF
   * @returns {{
   *   certificateNumber: string,
   *   studentName: string,
   *   classActivity: string,
   *   serviceDates: string,
   *   dateIssued: string,
   *   totalAmount: number,
   *   amountUnreadable: false
   * } | { amountUnreadable: true }}
   */
  parse(ocrText) {
    const text = String(ocrText);

    const totalAmount = parseAmount(fieldValue(text, 'TOTAL AMOUNT'));
    if (totalAmount == null || totalAmount === 0) {
      return { amountUnreadable: true };
    }

    return {
      certificateNumber: fieldValue(text, 'CERTIFICATE NUMBER'),
      studentName: fieldValue(text, 'STUDENT NAME'),
      classActivity: fieldValue(text, 'CLASS/ACTIVITY'),
      serviceDates: fieldValue(text, 'SERVICE DATE(S)'),
      dateIssued: fieldValue(text, 'DATE ISSUED'),
      totalAmount,
      amountUnreadable: false,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateParser;
}
