/**
 * PdfText — Slice 11 (#24). Edge cases of the PDF structure the certificate
 * fixtures don't exercise; the fixtures themselves are covered in
 * CertExtractor.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

global.ZlibInflate = require('../src/ZlibInflate.js');
const PdfText = require('../src/PdfText.js');

/** One-page PDF; `lengthAsRef` stores the content stream's /Length in its own object. */
function pdfWith(content, opts) {
  const stream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const lengthEntry = opts && opts.lengthAsRef ? '/Length 12 0 R' : '/Length ' + stream.length;
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.from('1 0 obj\n<<' + lengthEntry + '/Filter/FlateDecode>>stream\n', 'latin1'),
    stream,
    Buffer.from(
      '\nendstream\nendobj\n' +
        '12 0 obj\n' + stream.length + '\nendobj\n' +
        '2 0 obj\n<</Type/Page/Contents 1 0 R>>\nendobj\n' +
        // A later binary stream holding a decoy "2 0 obj" header, as a logo image might.
        '9 0 obj\n<</Length 30>>stream\nxx 2 0 obj <</Type/Page>> junk\nendstream\nendobj\n',
      'latin1'
    ),
  ]);
}

const LINE = 'BT\n1 0 0 1 22 456 Tm\n/F1 12 Tf\n(TOTAL AMOUNT:)Tj\nET\n';

test('reads a content stream whose /Length is an indirect reference', () => {
  assert.deepEqual(PdfText.textRuns(pdfWith(LINE, { lengthAsRef: true })), [
    { x: 22, y: 456, text: 'TOTAL AMOUNT:' },
  ]);
});

test('an "N 0 obj" pattern inside another stream is not mistaken for an object', () => {
  assert.equal(PdfText.textRuns(pdfWith(LINE)).length, 1);
});

test('decodes escapes, octal and WinAnsi characters in strings', () => {
  const runs = PdfText.textRuns(pdfWith('BT 1 0 0 1 5 6 Tm (SERVICE DATE\\(S\\):) Tj (caf\\351 \\226 x) Tj ET'));

  assert.deepEqual(runs.map((r) => r.text), ['SERVICE DATE(S):', 'café – x']);
});

test('tracks Td moves relative to the line matrix', () => {
  const runs = PdfText.textRuns(pdfWith('BT 20 602 Td 0 -82 Td (a) Tj 10 -16 Td (b) Tj ET'));

  assert.deepEqual(runs, [
    { x: 20, y: 520, text: 'a' },
    { x: 30, y: 504, text: 'b' },
  ]);
});

test('stray delimiters in the content stream are skipped, not crashed on', () => {
  const runs = PdfText.textRuns(pdfWith('BT ) \u0000 1 0 0 1 5 6 Tm (ok) Tj ET'));

  assert.deepEqual(runs.map((r) => r.text), ['ok']);
});
