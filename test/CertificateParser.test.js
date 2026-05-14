/**
 * CertificateParser (pure) — Slice 2 (#3).
 *
 * Fixtures in test/fixtures/*.ocr.txt model Drive's Google-Doc OCR conversion
 * of the sample PDFs in `Enrichment certificate example/` — the right-hand
 * money column linearised onto the same lines as the left column.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CertificateParser = require('../src/CertificateParser.js');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

const cases = [
  {
    file: 'MVA-128651-C006.ocr.txt',
    expected: {
      certificateNumber: 'MVA-128651-C006',
      studentName: 'Monique Garcia',
      classActivity: 'Group Tutoring - 1 Hour',
      serviceDates: 'Apr 01, 2026',
      dateIssued: '3/25/2026',
      totalAmount: 25,
      amountUnreadable: false,
    },
  },
  {
    file: 'MVA-128651-C010.ocr.txt',
    expected: {
      certificateNumber: 'MVA-128651-C010',
      studentName: 'Monique Garcia',
      classActivity: 'Individual Tutoring - Language Arts',
      serviceDates: 'Mar 03, 2026',
      dateIssued: '3/25/2026',
      totalAmount: 50,
      amountUnreadable: false,
    },
  },
  {
    file: 'MVA-56239-C062.ocr.txt',
    expected: {
      certificateNumber: 'MVA-56239-C062',
      studentName: 'Phoebe Hansen',
      classActivity: 'Group Tutoring - Monthly',
      serviceDates: 'May 2026',
      dateIssued: '3/16/2026',
      totalAmount: 375,
      amountUnreadable: false,
    },
  },
  {
    file: 'MVA-56239-C063.ocr.txt',
    expected: {
      certificateNumber: 'MVA-56239-C063',
      studentName: 'Phoebe Hansen',
      classActivity: 'Individual Tutoring - Language Arts',
      serviceDates: 'May 19, 2026',
      dateIssued: '3/16/2026',
      totalAmount: 50,
      amountUnreadable: false,
    },
  },
];

for (const { file, expected } of cases) {
  test(`parses ${file} into a structured Certificate`, () => {
    assert.deepEqual(CertificateParser.parse(fixture(file)), expected);
  });
}

test('a monthly service period is captured verbatim, not swallowing the notices block', () => {
  const cert = CertificateParser.parse(fixture('MVA-56239-C062.ocr.txt'));
  assert.equal(cert.serviceDates, 'May 2026');
});

test('signals amountUnreadable when TOTAL AMOUNT is absent from the OCR text', () => {
  const noMoneyColumn = [
    'CERTIFICATE NUMBER: MVA-128651-C006',
    'STUDENT NAME: Monique Garcia',
    'CLASS/ACTIVITY: Group Tutoring - 1 Hour',
    'SERVICE DATE(S): Apr 01, 2026',
    'DATE ISSUED: 3/25/2026',
  ].join('\n');
  assert.deepEqual(CertificateParser.parse(noMoneyColumn), { amountUnreadable: true });
});

test('signals amountUnreadable when TOTAL AMOUNT is $0', () => {
  const zeroAmount = fixture('MVA-128651-C006.ocr.txt').replace(
    'TOTAL AMOUNT: $25.00',
    'TOTAL AMOUNT: $0.00'
  );
  assert.deepEqual(CertificateParser.parse(zeroAmount), { amountUnreadable: true });
});

test('parses a thousands-separated amount', () => {
  const bigAmount = fixture('MVA-56239-C062.ocr.txt').replace(
    'TOTAL AMOUNT: $375.00',
    'TOTAL AMOUNT: $1,375.00'
  );
  assert.equal(CertificateParser.parse(bigAmount).totalAmount, 1375);
});
