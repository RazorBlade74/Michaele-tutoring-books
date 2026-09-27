/**
 * DigestBuilder — Slice 5 (#6) digest-email shaping.
 *
 * The builder is pure: a run result in, an email payload (or null) out. Tests
 * pin the shape of each section and that an empty run produces no digest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const DigestBuilder = require('../src/DigestBuilder.js');

function emptyResult() {
  return { certificatesEntered: [], certificatesFlagged: [], invoicesDrafted: [] };
}

test('a run that did nothing produces no digest', () => {
  assert.equal(DigestBuilder.build(emptyResult()), null);
});

test('a certificates-only run has a Certificates entered section and no Invoices section', () => {
  const result = Object.assign(emptyResult(), {
    certificatesEntered: [
      { certificateNumber: 'MVA-128651-C006', tabName: 'Monique' },
      { certificateNumber: 'MVA-128651-C010', tabName: 'Monique' },
    ],
  });

  const digest = DigestBuilder.build(result);

  assert.match(digest.body, /Certificates entered \(2\)/);
  assert.match(digest.body, /MVA-128651-C006/);
  assert.match(digest.body, /MVA-128651-C010/);
  assert.match(digest.body, /Monique/);
  assert.doesNotMatch(digest.body, /Invoices drafted/);
});

test('an invoices-only run has an Invoices drafted section and no Certificates entered section', () => {
  const result = Object.assign(emptyResult(), {
    invoicesDrafted: [
      {
        tabName: 'Monique',
        invoiceNumber: '2026-001',
        certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C010'],
        total: 75,
      },
    ],
  });

  const digest = DigestBuilder.build(result);

  assert.match(digest.body, /Invoices drafted \(1\)/);
  assert.match(digest.body, /2026-001/);
  assert.match(digest.body, /Monique/);
  assert.match(digest.body, /\$75\.00/);
  assert.match(digest.body, /MVA-128651-C006/);
  assert.match(digest.body, /MVA-128651-C010/);
  assert.doesNotMatch(digest.body, /Certificates entered/);
});

test('a combined run has both sections in order: entered, flagged, drafted', () => {
  const result = {
    certificatesEntered: [{ certificateNumber: 'MVA-128651-C006', tabName: 'Monique' }],
    certificatesFlagged: [
      {
        reason: 'unknown-student',
        certificateNumber: 'MVA-999999-C001',
        studentId: '999999',
        attachmentName: 'mystery.pdf',
        detail: "Student ID 999999 (MVA-999999-C001, mystery.pdf) isn't on the roster.",
      },
    ],
    invoicesDrafted: [
      {
        tabName: 'Monique',
        invoiceNumber: '2026-001',
        certificateNumbers: ['MVA-128651-C006'],
        total: 25,
      },
    ],
  };

  const digest = DigestBuilder.build(result);

  const enteredIdx = digest.body.indexOf('Certificates entered');
  const flaggedIdx = digest.body.indexOf('Certificates flagged');
  const draftedIdx = digest.body.indexOf('Invoices drafted');
  assert.ok(enteredIdx >= 0 && flaggedIdx > enteredIdx && draftedIdx > flaggedIdx);
});

test('each flagged certificate is shown by its plain-English detail, not its reason code', () => {
  const result = Object.assign(emptyResult(), {
    certificatesFlagged: [
      {
        reason: 'unknown-student',
        certificateNumber: 'MVA-999999-C001',
        studentId: '999999',
        attachmentName: 'stranger.pdf',
        detail:
          "Student ID 999999 (MVA-999999-C001, stranger.pdf) isn't on the roster. " +
          'On the Config tab, add a roster row; the next run will pick it up.',
      },
      {
        reason: 'amount-unreadable',
        certificateNumber: null,
        studentId: null,
        attachmentName: 'blurry.pdf',
        detail:
          "Couldn't read blurry.pdf: the TOTAL AMOUNT on the certificate couldn't be read. " +
          'Open the PDF and enter it by hand.',
      },
    ],
  });

  const digest = DigestBuilder.build(result);

  assert.match(digest.body, /Certificates flagged \(2\)/);
  assert.ok(
    digest.body.includes(
      "  - Student ID 999999 (MVA-999999-C001, stranger.pdf) isn't on the roster. " +
        'On the Config tab, add a roster row; the next run will pick it up.'
    )
  );
  assert.ok(
    digest.body.includes(
      "  - Couldn't read blurry.pdf: the TOTAL AMOUNT on the certificate couldn't be read. " +
        'Open the PDF and enter it by hand.'
    )
  );
  assert.doesNotMatch(digest.body, /unknown-student|amount-unreadable/);
});

test('a flagged-only run still produces a digest (something happened)', () => {
  const result = Object.assign(emptyResult(), {
    certificatesFlagged: [
      {
        reason: 'amount-unreadable',
        certificateNumber: null,
        studentId: null,
        attachmentName: 'blurry.pdf',
        detail: "Couldn't read blurry.pdf: the TOTAL AMOUNT on the certificate couldn't be read.",
      },
    ],
  });

  const digest = DigestBuilder.build(result);

  assert.ok(digest, 'a flagged-only run is not "nothing happened"');
  assert.match(digest.body, /Certificates flagged/);
});

test('the subject summarises the run counts', () => {
  const result = {
    certificatesEntered: [
      { certificateNumber: 'MVA-128651-C006', tabName: 'Monique' },
      { certificateNumber: 'MVA-128651-C010', tabName: 'Monique' },
    ],
    certificatesFlagged: [
      {
        reason: 'unknown-student',
        certificateNumber: 'MVA-999999-C001',
        studentId: '999999',
        attachmentName: 'mystery.pdf',
        detail: "Student ID 999999 (MVA-999999-C001, mystery.pdf) isn't on the roster.",
      },
    ],
    invoicesDrafted: [
      {
        tabName: 'Monique',
        invoiceNumber: '2026-001',
        certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C010'],
        total: 75,
      },
    ],
  };

  const digest = DigestBuilder.build(result);

  assert.match(digest.subject, /2 entered/);
  assert.match(digest.subject, /1 flagged/);
  assert.match(digest.subject, /1 drafted/);
});
