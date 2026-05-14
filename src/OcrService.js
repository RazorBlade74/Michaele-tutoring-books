/**
 * OcrService (I/O) — converts a PDF blob to text via Drive's Google-Doc
 * conversion.
 *
 * Required because the certificate PDF text layer drops the right-hand money
 * column (`TOTAL AMOUNT` included). Inserting the PDF as a Google Doc with
 * `ocr: true` re-reads the page image, capturing that column. Built in
 * Slice 2 (#3).
 *
 * Uses the advanced Drive service (`Drive`, v2) — declared in appsscript.json.
 */
const OcrService = {
  /**
   * @param {GoogleAppsScript.Base.Blob} pdfBlob a PDF attachment blob
   * @returns {string} the OCR'd text
   */
  pdfToText(pdfBlob) {
    const file = Drive.Files.insert(
      {
        title: pdfBlob.getName() + ' (OCR temp)',
        mimeType: 'application/vnd.google-apps.document',
      },
      pdfBlob,
      { ocr: true, ocrLanguage: 'en' }
    );
    try {
      return DocumentApp.openById(file.id).getBody().getText();
    } finally {
      Drive.Files.remove(file.id);
    }
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcrService;
}
