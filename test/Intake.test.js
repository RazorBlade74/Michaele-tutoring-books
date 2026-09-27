/**
 * Intake.runIntake — Slice 3 (#4) robustness wiring; Slice 11 (#24) PDF-text reader.
 *
 * runIntake is the I/O wiring module: in Apps Script its collaborators are
 * file-scope globals, and Node sees them as globals too. The test injects fakes
 * for the I/O collaborators (Gmail, CertExtractor, Config, Ledger) and keeps
 * the real pure CertificateNumber parser. Each fake attachment blob carries
 * the Certificate it extracts to (or a `throw` instruction), so a test states
 * intent ("this attachment is unreadable", "a label was missing on this one")
 * directly, without PDF fixtures.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');

// Faked so a blob can carry its own extracted Certificate (see `blob` below) —
// or throw if `blob.throws` is set, to simulate a certificate that can't be read.
global.CertExtractor = {
  extract(blob) {
    if (blob.throws) throw new Error(blob.throws);
    return blob.cert;
  },
};

let env;
global.ConfigGateway = {
  getRoster() {
    return env.roster;
  },
  getInvoiceSettings() {
    return { goLiveDate: env.goLiveDate };
  },
};
global.GmailIntakeSource = {
  findCertificateEmails(afterDate) {
    env.afterDatePassed = afterDate;
    return env.messages;
  },
  getPdfAttachments(message) {
    return message.attachments;
  },
};
global.LedgerGateway = {
  readRows(tabName) {
    return env.ledger[tabName] || [];
  },
  appendRow(tabName, row) {
    (env.ledger[tabName] = env.ledger[tabName] || []).push(row);
    env.appended.push({ tabName: tabName, row: row });
  },
};

const { runIntake } = require('../src/Intake.js');

function blob(name, cert) {
  return { getName: () => name, cert: cert };
}
function message(attachments) {
  return { attachments: attachments };
}
function readableCert(certificateNumber, overrides) {
  return Object.assign(
    {
      certificateNumber: certificateNumber,
      studentName: 'Monique Garcia',
      classActivity: 'Group Tutoring - 1 Hour',
      serviceDates: 'Apr 01, 2026',
      dateIssued: '3/25/2026',
      totalAmount: 25,
      amountPerUnit: 25,
      materialsFee: 0,
    },
    overrides || {}
  );
}

test.beforeEach(() => {
  env = {
    roster: [
      { studentId: '128651', certName: 'M Garcia', tabName: 'Monique', active: true },
    ],
    goLiveDate: new Date('2026-01-01'),
    messages: [],
    ledger: {},
    appended: [],
  };
});

test('an Order email with multiple PDF attachments produces one Certificate row per attachment', () => {
  env.messages = [
    message([
      blob('MVA-128651-C006.pdf', readableCert('MVA-128651-C006')),
      blob('MVA-128651-C010.pdf', readableCert('MVA-128651-C010', { totalAmount: 50 })),
    ]),
  ];

  const result = runIntake();

  assert.equal(result.entered.length, 2);
  assert.deepEqual(
    env.ledger['Monique'].map((row) => row.certificateNumber),
    ['MVA-128651-C006', 'MVA-128651-C010']
  );
});

test('a written Certificate row is typed and carries the approved amount as a negative', () => {
  env.messages = [message([blob('c6.pdf', readableCert('MVA-128651-C006'))])];

  runIntake();

  assert.deepEqual(env.appended[0], {
    tabName: 'Monique',
    row: {
      date: '3/25/2026',
      type: 'Certificate',
      description: 'Group Tutoring - 1 Hour — Apr 01, 2026',
      amount: -25,
      certificateNumber: 'MVA-128651-C006',
      status: '',
    },
  });
});

test('a Certificate already on the Student Ledger is skipped silently — no duplicate row', () => {
  env.ledger['Monique'] = [
    { type: 'Certificate', certificateNumber: 'MVA-128651-C006' },
  ];
  env.messages = [message([blob('c6.pdf', readableCert('MVA-128651-C006'))])];

  const result = runIntake();

  assert.equal(result.entered.length, 0);
  assert.equal(result.flagged.length, 0);
  assert.equal(env.appended.length, 0);
});

test('the same Certificate surfaced twice in one run is written once', () => {
  const sameOrder = () =>
    message([blob('c6.pdf', readableCert('MVA-128651-C006'))]);
  env.messages = [sameOrder(), sameOrder()];

  const result = runIntake();

  assert.equal(result.entered.length, 1);
  assert.equal(env.appended.length, 1);
});

test('a Certificate for a Student ID not in the roster is flagged, not written', () => {
  env.messages = [message([blob('x.pdf', readableCert('MVA-999999-C001'))])];

  const result = runIntake();

  assert.equal(env.appended.length, 0);
  assert.equal(result.flagged.length, 1);
  const flag = result.flagged[0];
  assert.equal(flag.reason, 'unknown-student');
  assert.equal(flag.certificateNumber, 'MVA-999999-C001');
  assert.equal(flag.studentId, '999999');
  assert.equal(flag.attachmentName, 'x.pdf');
});

test('an unknown-student flag tells the tutor exactly what to add to the Config tab', () => {
  env.messages = [
    message([
      blob('x.pdf', readableCert('MVA-999999-C001', { studentName: 'Jonah Lee' })),
    ]),
  ];

  const detail = runIntake().flagged[0].detail;

  assert.match(detail, /^Student ID 999999 \(MVA-999999-C001, x\.pdf\) isn't on the roster\./);
  assert.match(detail, /Config tab/);
  assert.match(detail, /Student ID: 999999/);
  assert.match(detail, /Cert Name: Jonah Lee/);
  assert.match(detail, /Tab Name/);
  assert.match(detail, /Active\?: Yes/);
  assert.match(detail, /Date, Type, Description, Amount, Certificate Number, Status/);
  assert.match(detail, /The next run will pick it up/);
});

test('an attachment that CertExtractor throws on is flagged as extraction-failed, not crashed on', () => {
  env.messages = [
    message([
      { getName: () => 'broken.pdf', throws: 'CertExtractor: the "TOTAL AMOUNT" label wasn\'t found on the certificate' },
      blob('ok.pdf', readableCert('MVA-128651-C006')),
    ]),
  ];

  const result = runIntake();

  assert.equal(env.appended.length, 1);
  assert.equal(result.flagged.length, 1);
  const flag = result.flagged[0];
  assert.equal(flag.reason, 'extraction-failed');
  assert.equal(flag.certificateNumber, null);
  assert.equal(flag.studentId, null);
  assert.equal(flag.attachmentName, 'broken.pdf');
  assert.equal(result.entered.length, 1);
});

function extractionFailureDetail(errorMessage) {
  env.messages = [message([{ getName: () => 'MVA-76812-C028.pdf', throws: errorMessage }])];
  return runIntake().flagged[0].detail;
}

test('a certificate the reader rejects tells the tutor why, in its own words, and to enter it by hand', () => {
  const detail = extractionFailureDetail(
    'CertExtractor: the "TOTAL AMOUNT" label wasn\'t found on the certificate'
  );

  assert.equal(
    detail,
    "Couldn't read MVA-76812-C028.pdf: the \"TOTAL AMOUNT\" label wasn't found on the certificate. " +
      'Open the PDF and enter it by hand.'
  );
});

test('a long reader message is trimmed', () => {
  const detail = extractionFailureDetail('CertExtractor: the "TOTAL AMOUNT" value "' + 'x'.repeat(500) + '" isn\'t a dollar amount');

  assert.match(detail, /^Couldn't read MVA-76812-C028\.pdf: the "TOTAL AMOUNT" value/);
  assert.match(detail, /enter it by hand/);
  assert.ok(detail.length < 400, 'a runaway error message is truncated');
});

test('an unrecognised extraction error still carries the error message, trimmed', () => {
  const detail = extractionFailureDetail('Exceeded maximum execution time' + 'x'.repeat(500));

  assert.match(detail, /^Couldn't read MVA-76812-C028\.pdf: /);
  assert.match(detail, /Exceeded maximum execution time/);
  assert.match(detail, /enter it by hand/);
  assert.ok(detail.length < 400, 'a runaway error message is truncated');
});

test('a Certificate with a malformed Certificate Number is flagged as extraction-failed, not crashed on', () => {
  env.messages = [
    message([
      blob('hallucinated.pdf', readableCert('NOT-A-CERT-NUMBER')),
    ]),
  ];

  const result = runIntake();

  assert.equal(env.appended.length, 0);
  assert.deepEqual(result.flagged, [
    {
      reason: 'extraction-failed',
      certificateNumber: 'NOT-A-CERT-NUMBER',
      studentId: null,
      attachmentName: 'hallucinated.pdf',
      detail:
        "Couldn't read hallucinated.pdf: the Certificate Number came back as " +
        '"NOT-A-CERT-NUMBER", which isn\'t a valid MVA certificate number. ' +
        'Open the PDF and enter it by hand.',
    },
  ]);
});

test('a Certificate with no Certificate Number at all says none was found', () => {
  env.messages = [message([blob('blank.pdf', readableCert(''))])];

  const detail = runIntake().flagged[0].detail;

  assert.equal(
    detail,
    "Couldn't read blank.pdf: no Certificate Number was found on it. " +
      'Open the PDF and enter it by hand.'
  );
});

test('runIntake filters intake by passing the Config go-live date to the Gmail source', () => {
  runIntake();

  assert.equal(env.afterDatePassed, env.goLiveDate);
});

test('runIntake returns a structured result of what was entered and what was flagged', () => {
  env.messages = [
    message([
      blob('ok.pdf', readableCert('MVA-128651-C006')),
      { getName: () => 'bad.pdf', throws: 'CertExtractor: the "DATE ISSUED" label wasn\'t found on the certificate' },
    ]),
  ];

  const result = runIntake();

  assert.deepEqual(result.entered, [
    { certificateNumber: 'MVA-128651-C006', tabName: 'Monique' },
  ]);
  assert.equal(result.flagged.length, 1);
  assert.equal(result.flagged[0].reason, 'extraction-failed');
});
