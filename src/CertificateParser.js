/**
 * CertificateParser (pure) — OCR'd certificate text to a structured Certificate.
 *
 * Returns an explicit "amount unreadable" signal when `TOTAL AMOUNT` can't be
 * confidently extracted or is $0. Built in Slice 2 (#3).
 */
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
    throw new Error('CertificateParser.parse not implemented — Slice 2 (#3)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateParser;
}
