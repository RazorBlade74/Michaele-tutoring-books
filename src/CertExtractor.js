/**
 * CertExtractor (I/O) — PDF blob to structured Certificate via Gemini 2.5 Flash.
 *
 * The certificate is a two-column PDF whose money column (TOTAL AMOUNT etc.)
 * doesn't survive Drive's PDF-to-Doc OCR conversion. We send the PDF directly
 * to Gemini with a `responseSchema` and let the model return the fields as
 * JSON — more accurate on this template than label-anchored regex over OCR
 * text, and resilient to Drive OCR regressing again.
 *
 * Reads the API key from `PropertiesService` script property `GEMINI_API_KEY`.
 * Setup steps are in `docs/gemini-intake-setup.md`.
 *
 * Model is pinned to `gemini-2.5-flash` so a Google-side bump can't silently
 * change extraction behavior. Bump deliberately when revisiting.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/' +
  GEMINI_MODEL +
  ':generateContent';

const EXTRACTION_PROMPT = [
  'The attached PDF is an MVA (Mission Vista Academy) enrichment certificate.',
  'Extract these fields verbatim from the document and return JSON matching the schema:',
  '- certificateNumber: the value labeled "CERTIFICATE NUMBER" (format MVA-{digits}-C{digits}).',
  '- studentName: the value labeled "STUDENT NAME".',
  '- classActivity: the value labeled "CLASS/ACTIVITY".',
  '- serviceDates: the value labeled "SERVICE DATE(S)".',
  '- dateIssued: the value labeled "DATE ISSUED", in M/D/YYYY form.',
  '- totalAmount: the dollar value labeled "TOTAL AMOUNT" as a number — no currency symbol, no commas.',
  'If a field is missing or unreadable, return an empty string for it (or 0 for totalAmount).',
].join('\n');

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    certificateNumber: { type: 'string' },
    studentName: { type: 'string' },
    classActivity: { type: 'string' },
    serviceDates: { type: 'string' },
    dateIssued: { type: 'string' },
    totalAmount: { type: 'number' },
  },
  required: [
    'certificateNumber',
    'studentName',
    'classActivity',
    'serviceDates',
    'dateIssued',
    'totalAmount',
  ],
};

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
   *   amountUnreadable: false
   * } | { amountUnreadable: true }}
   * @throws when the API key is missing, the HTTP call fails, or the response
   *   isn't the JSON shape we asked for — Intake catches and flags these.
   */
  extract(pdfBlob) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'CertExtractor: script property GEMINI_API_KEY is not set — see docs/gemini-intake-setup.md'
      );
    }

    const payload = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: Utilities.base64Encode(pdfBlob.getBytes()),
              },
            },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    const response = UrlFetchApp.fetch(GEMINI_ENDPOINT + '?key=' + encodeURIComponent(apiKey), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error('CertExtractor: Gemini HTTP ' + code + ': ' + body);
    }

    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch (e) {
      throw new Error('CertExtractor: Gemini response was not JSON: ' + body);
    }

    const textPart =
      envelope &&
      envelope.candidates &&
      envelope.candidates[0] &&
      envelope.candidates[0].content &&
      envelope.candidates[0].content.parts &&
      envelope.candidates[0].content.parts[0] &&
      envelope.candidates[0].content.parts[0].text;
    if (!textPart) {
      throw new Error('CertExtractor: Gemini response missing candidates[0].content.parts[0].text: ' + body);
    }

    let cert;
    try {
      cert = JSON.parse(textPart);
    } catch (e) {
      throw new Error('CertExtractor: Gemini structured-output text was not JSON: ' + textPart);
    }

    if (!cert.totalAmount || cert.totalAmount === 0) {
      return { amountUnreadable: true };
    }

    return {
      certificateNumber: cert.certificateNumber,
      studentName: cert.studentName,
      classActivity: cert.classActivity,
      serviceDates: cert.serviceDates,
      dateIssued: cert.dateIssued,
      totalAmount: cert.totalAmount,
      amountUnreadable: false,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertExtractor;
}
