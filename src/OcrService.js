/**
 * OcrService (I/O) — converts a PDF blob to text via Drive's Google-Doc
 * conversion.
 *
 * Required because the certificate PDF text layer drops the right-hand money
 * column (`TOTAL AMOUNT` included). Built in Slice 2 (#3).
 */
const OcrService = {
  /**
   * @param {object} pdfBlob a PDF attachment blob
   * @returns {string} the OCR'd text
   */
  pdfToText(pdfBlob) {
    throw new Error('OcrService.pdfToText not implemented — Slice 2 (#3)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcrService;
}
