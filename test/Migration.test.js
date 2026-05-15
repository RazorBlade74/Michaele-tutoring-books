/**
 * Migration.run / Migration.formatReport — Slice 6 (#7) go-live dry-run.
 *
 * Migration.run is the I/O wiring module: ConfigGateway and LedgerGateway are
 * file-scope globals in Apps Script and Node sees them as globals too. The test
 * keeps the real pure modules (PoolEngine, CertificateNumber) and injects fakes
 * for the I/O collaborators.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');
global.PoolEngine = require('../src/PoolEngine.js');

let env;
global.ConfigGateway = {
  getRoster() {
    return env.roster;
  },
};
global.LedgerGateway = {
  readRows(tabName) {
    return env.ledger[tabName] || [];
  },
};

const { Migration } = require('../src/Migration.js');

function session(amount) {
  return { type: 'Session', amount: amount, certificateNumber: '', status: '' };
}
function certificate(certificateNumber, amount) {
  return {
    type: 'Certificate',
    amount: -Math.abs(amount),
    certificateNumber: certificateNumber,
    status: '',
  };
}
function invoice(certificateNumber, amount) {
  return {
    type: 'Invoice',
    amount: amount,
    certificateNumber: certificateNumber,
    status: 'Draft',
  };
}
function charge(amount) {
  return { type: 'Charge', amount: amount, certificateNumber: '', status: '' };
}

test.beforeEach(() => {
  env = {
    roster: [
      { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique', active: true },
    ],
    ledger: {},
  };
});

test('Migration.run summarises an active Student with pool, open certs, and would-draft batch', () => {
  env.ledger['Monique'] = [
    session(100),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
    certificate('MVA-128651-C012', 200),
  ];

  const report = Migration.run();

  assert.deepEqual(report, {
    students: [
      {
        studentId: '128651',
        tabName: 'Monique',
        sessionPool: 100,
        uninvoicedCertificates: [
          { certificateNumber: 'MVA-128651-C006', amount: 25 },
          { certificateNumber: 'MVA-128651-C010', amount: 50 },
          { certificateNumber: 'MVA-128651-C012', amount: 200 },
        ],
        wouldDraftBatch: ['MVA-128651-C006', 'MVA-128651-C010'],
        wouldInvoiceTotal: 75,
        runningBalance: -175,
      },
    ],
  });
});

test('Migration.run lists uninvoiced certs in seq order, regardless of ledger row order', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C012', 30),
    certificate('MVA-128651-C006', 25),
    session(0),
    certificate('MVA-128651-C010', 50),
  ];

  const report = Migration.run();

  assert.deepEqual(
    report.students[0].uninvoicedCertificates.map((c) => c.certificateNumber),
    ['MVA-128651-C006', 'MVA-128651-C010', 'MVA-128651-C012']
  );
});

test('Migration.run excludes already-invoiced Certificates from the uninvoiced list', () => {
  env.ledger['Monique'] = [
    session(75),
    certificate('MVA-128651-C006', 25),
    invoice('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const report = Migration.run();

  // C006 is already invoiced; only C010 is open. Pool is $75 of Sessions, but
  // $25 was consumed by the C006 invoice, leaving $50 drawable — exactly C010.
  assert.deepEqual(report.students[0].uninvoicedCertificates, [
    { certificateNumber: 'MVA-128651-C010', amount: 50 },
  ]);
  assert.deepEqual(report.students[0].wouldDraftBatch, ['MVA-128651-C010']);
});

test('Migration.run skips inactive Students', () => {
  env.roster = [
    { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique', active: true },
    { studentId: '999999', certName: 'Old Student', tabName: 'Inactive', active: false },
  ];
  env.ledger['Inactive'] = [session(50), certificate('MVA-999999-C001', 25)];

  const report = Migration.run();

  assert.deepEqual(
    report.students.map((s) => s.tabName),
    ['Monique']
  );
});

test('Migration.run reports a zero pool and empty batch for a Student with no ledger rows', () => {
  // ledger['Monique'] left empty
  const report = Migration.run();

  assert.deepEqual(report.students[0], {
    studentId: '128651',
    tabName: 'Monique',
    sessionPool: 0,
    uninvoicedCertificates: [],
    wouldDraftBatch: [],
    wouldInvoiceTotal: 0,
    runningBalance: 0,
  });
});

test('Migration.run reports an empty batch when the pool partially covers the oldest cert', () => {
  env.ledger['Monique'] = [
    session(20),
    certificate('MVA-128651-C006', 25), // pool $20 < $25 — strict FIFO, no skip-ahead
    certificate('MVA-128651-C010', 10), // even though pool would cover this in isolation
  ];

  const report = Migration.run();

  assert.deepEqual(report.students[0].wouldDraftBatch, []);
  assert.equal(report.students[0].wouldInvoiceTotal, 0);
  assert.equal(report.students[0].sessionPool, 20);
  assert.equal(report.students[0].uninvoicedCertificates.length, 2);
});

test('Migration.formatReport renders pool, open certs, and would-draft for each active Student', () => {
  const report = {
    students: [
      {
        studentId: '128651',
        tabName: 'Monique',
        sessionPool: 100,
        uninvoicedCertificates: [
          { certificateNumber: 'MVA-128651-C006', amount: 25 },
          { certificateNumber: 'MVA-128651-C010', amount: 50 },
        ],
        wouldDraftBatch: ['MVA-128651-C006', 'MVA-128651-C010'],
        wouldInvoiceTotal: 75,
        runningBalance: 100,
      },
    ],
  };

  const text = Migration.formatReport(report);

  assert.match(text, /Monique \(128651\)/);
  assert.match(text, /Session Pool: \$100\.00/);
  assert.match(text, /MVA-128651-C006 — \$25\.00/);
  assert.match(text, /MVA-128651-C010 — \$50\.00/);
  assert.match(text, /Would draft: MVA-128651-C006, MVA-128651-C010 — \$75\.00/);
  assert.match(text, /Running balance: \$100\.00/);
});

test('Migration.formatReport calls out a Student whose pool covers nothing', () => {
  const report = {
    students: [
      {
        studentId: '128651',
        tabName: 'Monique',
        sessionPool: 20,
        uninvoicedCertificates: [{ certificateNumber: 'MVA-128651-C006', amount: 25 }],
        wouldDraftBatch: [],
        wouldInvoiceTotal: 0,
        runningBalance: -5,
      },
    ],
  };

  const text = Migration.formatReport(report);

  assert.match(text, /Would draft: \(nothing/);
  assert.match(text, /Running balance: \$-5\.00/);
});

test('Migration.run sums every row signed (Charge + Certificate + Session + Invoice + Payment) into runningBalance', () => {
  // Phoebe-style migration tab: opening Charge + open Certificate rows. The
  // balance should match the old-sheet target ($100 in Phoebe's case).
  env.ledger['Monique'] = [
    charge(925),
    certificate('MVA-128651-C060', 375),
    certificate('MVA-128651-C061', 25),
    certificate('MVA-128651-C062', 375),
    certificate('MVA-128651-C063', 50),
  ];

  const report = Migration.run();

  assert.equal(report.students[0].runningBalance, 100);
});

test('Migration.run runningBalance handles cents without floating-point drift', () => {
  env.ledger['Monique'] = [charge(0.1), charge(0.2)];

  const report = Migration.run();

  assert.equal(report.students[0].runningBalance, 0.3);
});

test('Migration.formatReport says so when no active Students are on the roster', () => {
  const text = Migration.formatReport({ students: [] });
  assert.match(text, /no active Students/);
});
