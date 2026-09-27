/**
 * CertCheck (pure) — Slice 12 (#25): cross-check a Certificate before Intake
 * writes it to the ledger.
 *
 * `problems(cert, rosterCertName)` returns one plain-English sentence per
 * failed check, each saying what to do next; an empty list means the
 * Certificate may be written. Its only collaborator is the pure
 * `CertificateNumber` parser, supplied as a Node global. The last test runs
 * the scrubbed fixtures from #24 through the real CertExtractor first.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.CertificateNumber = require('../src/CertificateNumber.js');
const CertCheck = require('../src/CertCheck.js');
// The real reader, for the end-to-end fixture check.
global.ZlibInflate = require('../src/ZlibInflate.js');
global.PdfText = require('../src/PdfText.js');
const CertExtractor = require('../src/CertExtractor.js');

function cert(overrides) {
  return Object.assign(
    {
      certificateNumber: 'MVA-56239-C065',
      studentName: 'Phoebe Hansen',
      classActivity: 'Individual Tutoring - Math',
      serviceDates: 'Aug 28, 2026',
      dateIssued: '8/26/2026',
      totalAmount: 50,
      amountPerUnit: 50,
      materialsFee: 0,
    },
    overrides || {}
  );
}

test('a certificate whose total is one unit plus the materials fee passes', () => {
  assert.deepEqual(CertCheck.problems(cert({ totalAmount: 62.5, materialsFee: 12.5 }), 'Phoebe Hansen'), []);
});

test('a multi-hour certificate — a whole number of units plus the fee — passes', () => {
  assert.deepEqual(
    CertCheck.problems(cert({ totalAmount: 212.5, amountPerUnit: 50, materialsFee: 12.5 }), 'Phoebe Hansen'),
    []
  );
});

test('a total that is not a whole number of units plus the fee is flagged', () => {
  assert.deepEqual(CertCheck.problems(cert({ totalAmount: 75, amountPerUnit: 50 }), 'Phoebe Hansen'), [
    'Certificate MVA-56239-C065 has a TOTAL AMOUNT of $75.00, which isn\'t a whole number of ' +
      'AMOUNT PER UNIT ($50.00) plus MATERIALS FEE ($0.00). Check the PDF; if it\'s right, enter it by hand.',
  ]);
});

test('a total below one unit plus the fee is flagged', () => {
  assert.equal(
    CertCheck.problems(cert({ totalAmount: 50, amountPerUnit: 50, materialsFee: 10 }), 'Phoebe Hansen').length,
    1
  );
});

test('the arithmetic is compared in whole cents, so float rounding never flags a good certificate', () => {
  // 3 × 0.10 + 0.20 is 0.5000000000000001 in floating point.
  assert.deepEqual(
    CertCheck.problems(cert({ totalAmount: 0.5, amountPerUnit: 0.1, materialsFee: 0.2 }), 'Phoebe Hansen'),
    []
  );
});

test('a $0 total is flagged', () => {
  assert.deepEqual(
    CertCheck.problems(cert({ totalAmount: 0, amountPerUnit: 0, materialsFee: 0 }), 'Phoebe Hansen'),
    [
      'Certificate MVA-56239-C065 has a TOTAL AMOUNT of $0.00; an approved certificate is always for ' +
        "more than $0. Check the PDF; if it's right, enter it by hand.",
    ]
  );
});

test('a money field that is not a dollar amount is flagged by name, and the arithmetic is not attempted', () => {
  [
    ['totalAmount', 'TOTAL AMOUNT', NaN],
    ['amountPerUnit', 'AMOUNT PER UNIT', -50],
    ['materialsFee', 'MATERIALS FEE', 1.005],
    ['totalAmount', 'TOTAL AMOUNT', '50'],
  ].forEach(([field, label, value]) => {
    assert.deepEqual(
      CertCheck.problems(cert({ [field]: value }), 'Phoebe Hansen'),
      [
        'Certificate MVA-56239-C065 has a ' + label + ' of "' + value + '", which isn\'t a dollar amount. ' +
          "Check the PDF; if it's right, enter it by hand.",
      ],
      label + ' = ' + value
    );
  });
});

test('a student name differing from the roster only in case and whitespace passes', () => {
  assert.deepEqual(CertCheck.problems(cert({ studentName: '  phoebe   HANSEN ' }), 'Phoebe Hansen'), []);
});

test('a genuinely different student name is flagged, naming both spellings', () => {
  assert.deepEqual(CertCheck.problems(cert({ studentName: 'Phoebe Hanson' }), 'Phoebe Hansen'), [
    'Certificate MVA-56239-C065 says "Phoebe Hanson" but the roster says "Phoebe Hansen". ' +
      'If the certificate is right, update Cert Name on the Config tab.',
  ]);
});

test('a roster row with no Cert Name is flagged, saying what to fill in', () => {
  assert.deepEqual(CertCheck.problems(cert(), ''), [
    'Certificate MVA-56239-C065 says "Phoebe Hansen" but the roster has no Cert Name for Student ID 56239. ' +
      'If the certificate is right, enter "Phoebe Hansen" as Cert Name on the Config tab.',
  ]);
});

test('a malformed Certificate Number is flagged and nothing else is checked against the roster', () => {
  assert.deepEqual(CertCheck.problems(cert({ certificateNumber: 'MVA-56239-065' }), 'Phoebe Hansen'), [
    'Certificate "MVA-56239-065" doesn\'t have a valid MVA certificate number (MVA-{student ID}-C{number}). ' +
      "Check the PDF; if it's right, enter it by hand.",
  ]);
});

test('a real DATE ISSUED passes, leap days included', () => {
  ['2/29/2028', '12/31/2026', '1/1/2027', '09/05/2026'].forEach((dateIssued) => {
    assert.deepEqual(CertCheck.problems(cert({ dateIssued: dateIssued }), 'Phoebe Hansen'), [], dateIssued);
  });
});

test('a DATE ISSUED that is not a real calendar date is flagged', () => {
  ['2/30/2026', '2/29/2026', '13/1/2026', '0/10/2026', '9/31/2026', 'Sep 22, 2026', '9/22/26'].forEach((dateIssued) => {
    assert.deepEqual(
      CertCheck.problems(cert({ dateIssued: dateIssued }), 'Phoebe Hansen'),
      [
        'Certificate MVA-56239-C065 has a DATE ISSUED of "' + dateIssued + '", which isn\'t a real ' +
          "calendar date. Check the PDF; if it's right, enter it by hand.",
      ],
      dateIssued
    );
  });
});

test('a required field that came back empty is flagged by its label', () => {
  [
    ['studentName', 'STUDENT NAME'],
    ['classActivity', 'CLASS/ACTIVITY'],
    ['serviceDates', 'SERVICE DATE(S)'],
    ['dateIssued', 'DATE ISSUED'],
  ].forEach(([field, label]) => {
    assert.deepEqual(
      CertCheck.problems(cert({ [field]: '  ' }), 'Phoebe Hansen'),
      [
        'Certificate MVA-56239-C065 has no ' + label + ". Check the PDF; if it's right, enter it by hand.",
      ],
      label
    );
  });
});

test('every failed check is reported, not just the first', () => {
  const problems = CertCheck.problems(
    cert({ studentName: 'Phoebe Hanson', dateIssued: '2/30/2026', totalAmount: 75 }),
    'Phoebe Hansen'
  );

  assert.equal(problems.length, 3);
});

test('both scrubbed certificate fixtures, read by CertExtractor, pass every check', () => {
  ['cert-group-monthly.pdf', 'cert-individual-math-logo.pdf'].forEach((name) => {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', name));
    const extracted = CertExtractor.extract({ getName: () => name, getBytes: () => Array.from(bytes) });

    assert.deepEqual(CertCheck.problems(extracted, 'Test Student'), [], name);
  });
});
