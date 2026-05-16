/**
 * CertExtractor — Slice 8 (Gemini-based intake).
 *
 * I/O module: PropertiesService, Utilities, and UrlFetchApp are file-scope
 * globals in Apps Script. Each test stubs them with the response it wants
 * Gemini to produce and asserts the structured Certificate (or throw)
 * returned to Intake.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let apiKey;
let lastFetch;
let nextResponse;

global.PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(name) {
        return name === 'GEMINI_API_KEY' ? apiKey : null;
      },
    };
  },
};
global.Utilities = {
  base64Encode(bytes) {
    return 'base64(' + bytes.length + ')';
  },
};
global.UrlFetchApp = {
  fetch(url, options) {
    lastFetch = { url: url, options: options };
    return nextResponse;
  },
};

const CertExtractor = require('../src/CertExtractor.js');

function pdfBlob() {
  return { getName: () => 'cert.pdf', getBytes: () => [1, 2, 3] };
}

function geminiResponse(certJson, opts) {
  const code = (opts && opts.code) || 200;
  const body =
    opts && opts.body !== undefined
      ? opts.body
      : JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(certJson) }] } },
          ],
        });
  return {
    getResponseCode: () => code,
    getContentText: () => body,
  };
}

function readableCert() {
  return {
    certificateNumber: 'MVA-128651-C006',
    studentName: 'Monique Garcia',
    classActivity: 'Group Tutoring - 1 Hour',
    serviceDates: 'Apr 01, 2026',
    dateIssued: '3/25/2026',
    totalAmount: 25,
  };
}

test.beforeEach(() => {
  apiKey = 'fake-key';
  lastFetch = null;
  nextResponse = geminiResponse(readableCert());
});

test('returns a structured Certificate when Gemini returns the JSON we asked for', () => {
  const cert = CertExtractor.extract(pdfBlob());

  assert.deepEqual(cert, {
    certificateNumber: 'MVA-128651-C006',
    studentName: 'Monique Garcia',
    classActivity: 'Group Tutoring - 1 Hour',
    serviceDates: 'Apr 01, 2026',
    dateIssued: '3/25/2026',
    totalAmount: 25,
    amountUnreadable: false,
  });
});

test('posts the base64-encoded PDF and the schema-constrained prompt to the pinned 2.5 Flash endpoint', () => {
  CertExtractor.extract(pdfBlob());

  assert.match(lastFetch.url, /gemini-2\.5-flash:generateContent/);
  assert.match(lastFetch.url, /[?&]key=fake-key\b/);
  assert.equal(lastFetch.options.method, 'post');
  assert.equal(lastFetch.options.contentType, 'application/json');
  assert.equal(lastFetch.options.muteHttpExceptions, true);

  const payload = JSON.parse(lastFetch.options.payload);
  const parts = payload.contents[0].parts;
  assert.equal(parts[0].inline_data.mime_type, 'application/pdf');
  assert.equal(parts[0].inline_data.data, 'base64(3)');
  assert.match(parts[1].text, /CERTIFICATE NUMBER/);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.equal(payload.generationConfig.responseSchema.required.length, 6);
});

test('signals amountUnreadable when Gemini returns totalAmount = 0', () => {
  nextResponse = geminiResponse(Object.assign(readableCert(), { totalAmount: 0 }));

  assert.deepEqual(CertExtractor.extract(pdfBlob()), { amountUnreadable: true });
});

test('throws when the GEMINI_API_KEY script property is not set', () => {
  apiKey = null;

  assert.throws(() => CertExtractor.extract(pdfBlob()), /GEMINI_API_KEY/);
});

test('throws when Gemini returns a non-2xx HTTP status', () => {
  nextResponse = geminiResponse(null, { code: 429, body: '{"error":"quota"}' });

  assert.throws(() => CertExtractor.extract(pdfBlob()), /HTTP 429/);
});

test('throws when Gemini returns a body that is not JSON', () => {
  nextResponse = geminiResponse(null, { body: '<html>503 backend error</html>' });

  assert.throws(() => CertExtractor.extract(pdfBlob()), /was not JSON/);
});

test('throws when the JSON envelope is missing the candidates text part', () => {
  nextResponse = geminiResponse(null, { body: JSON.stringify({ candidates: [] }) });

  assert.throws(
    () => CertExtractor.extract(pdfBlob()),
    /missing candidates\[0\]\.content\.parts\[0\]\.text/
  );
});

test('throws when the structured-output text itself is not parseable JSON', () => {
  nextResponse = geminiResponse(null, {
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'not json' }] } }],
    }),
  });

  assert.throws(
    () => CertExtractor.extract(pdfBlob()),
    /structured-output text was not JSON/
  );
});
