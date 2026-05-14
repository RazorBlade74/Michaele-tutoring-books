/**
 * Intake.runIntake — Slice 3 (#4) robustness wiring.
 *
 * runIntake is the I/O wiring module: in Apps Script its collaborators are
 * file-scope globals, and Node sees them as globals too. The test injects fakes
 * for the I/O collaborators (Gmail, OCR, Config, Ledger) and keeps the real
 * pure CertificateNumber parser. Each fake attachment blob carries the
 * Certificate it parses to, so a test states intent ("this attachment is
 * unreadable") directly, without OCR fixtures.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');

// Faked so a blob can carry its own parsed Certificate (see `blob` below).
global.CertificateParser = {
  parse(blob) {
    return blob.cert;
  },
};
global.OcrService = {
  pdfToText(blob) {
    return blob; // passthrough — the faked parser reads the blob directly
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
      amountUnreadable: false,
      certificateNumber: certificateNumber,
      studentName: 'Monique Garcia',
      classActivity: 'Group Tutoring - 1 Hour',
      serviceDates: 'Apr 01, 2026',
      dateIssued: '3/25/2026',
      totalAmount: 25,
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
  assert.deepEqual(result.flagged, [
    {
      reason: 'unknown-student',
      certificateNumber: 'MVA-999999-C001',
      studentId: '999999',
      attachmentName: 'x.pdf',
    },
  ]);
});

test('a Certificate whose amount is unreadable is flagged, not written', () => {
  env.messages = [message([blob('bad.pdf', { amountUnreadable: true })])];

  const result = runIntake();

  assert.equal(env.appended.length, 0);
  assert.deepEqual(result.flagged, [
    {
      reason: 'amount-unreadable',
      certificateNumber: null,
      studentId: null,
      attachmentName: 'bad.pdf',
    },
  ]);
});

test('runIntake filters intake by passing the Config go-live date to the Gmail source', () => {
  runIntake();

  assert.equal(env.afterDatePassed, env.goLiveDate);
});

test('runIntake returns a structured result of what was entered and what was flagged', () => {
  env.messages = [
    message([
      blob('ok.pdf', readableCert('MVA-128651-C006')),
      blob('bad.pdf', { amountUnreadable: true }),
    ]),
  ];

  const result = runIntake();

  assert.deepEqual(result.entered, [
    { certificateNumber: 'MVA-128651-C006', tabName: 'Monique' },
  ]);
  assert.equal(result.flagged.length, 1);
  assert.equal(result.flagged[0].reason, 'amount-unreadable');
});
