/**
 * EarlyInvoice — Slice 9 (#20) tutor-initiated invoice-drafting path.
 *
 * EarlyInvoice is the I/O wiring module backing the modal dialog: its
 * collaborators (ConfigGateway, LedgerGateway, InvoiceWriter, CertificateNumber)
 * are file-scope globals in Apps Script and Node sees them as globals too. The
 * test keeps the real pure CertificateNumber and injects fakes for the rest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');

let env;
global.ConfigGateway = {
  getRoster() {
    return env.roster;
  },
  getInvoiceSettings() {
    return env.settings;
  },
  getInvoiceCounter() {
    return env.counter;
  },
  setInvoiceCounter(state) {
    env.counterSet = state;
  },
};
global.LedgerGateway = {
  readRows(tabName) {
    return env.ledger[tabName] || [];
  },
};
global.InvoiceWriter = {
  draft(options) {
    env.draftCalls.push(options);
    return {
      invoiceNumber: '2026-007',
      total: options.certRows.reduce(function (sum, row) {
        return sum + Math.abs(row.amount);
      }, 0),
      newCounterState: { year: 2026, counter: 8 },
    };
  },
};

const { EarlyInvoice } = require('../src/EarlyInvoice.js');

function session(amount) {
  return { type: 'Session', amount: amount, certificateNumber: '', status: '' };
}
function certificate(certificateNumber, amount, description) {
  return {
    type: 'Certificate',
    description: description == null ? 'Group Tutoring - Reading — Apr 01, 2026' : description,
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

test.beforeEach(() => {
  env = {
    roster: [
      { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique', active: true },
      { studentId: '56239', certName: 'Phoebe Hansen', tabName: 'Phoebe', active: true },
      { studentId: '999999', certName: 'Old Student', tabName: 'Inactive', active: false },
    ],
    settings: {
      goLiveDate: new Date('2026-01-01'),
      business: {
        name: 'Michaele LePenske - Online Tutoring',
        subtitle: 'Enrichment tutoring',
        address: '123 Lamp Post Ln',
        phone: '555-0100',
      },
      billTo: {
        name: 'Mission Vista Academy',
        address: '350 Civic Center Dr, Vista CA 92084',
      },
      invoicingEmail: 'invoicing@missionvistaacademy.org',
      defaultDescription: 'Core academics tutoring',
    },
    counter: { year: 2026, counter: 7 },
    ledger: {},
    draftCalls: [],
    counterSet: undefined,
  };
});

// ─── getStudents ────────────────────────────────────────────────────────────

test('getStudents returns only active roster entries, with the active flag dropped', () => {
  const students = EarlyInvoice.getStudents();

  assert.deepEqual(students, [
    { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique' },
    { studentId: '56239', certName: 'Phoebe Hansen', tabName: 'Phoebe' },
  ]);
});

test('getStudents returns an empty array when the roster has no active entries', () => {
  env.roster = [
    { studentId: '999999', certName: 'Old Student', tabName: 'Inactive', active: false },
  ];

  assert.deepEqual(EarlyInvoice.getStudents(), []);
});

// ─── getCertsForStudent ─────────────────────────────────────────────────────

test('getCertsForStudent sums Session-type rows into sessionPool', () => {
  env.ledger['Monique'] = [
    session(100),
    session(50),
    certificate('MVA-128651-C006', 25),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.equal(result.sessionPool, 150);
});

test('getCertsForStudent returns only Certificate rows with no matching Invoice row', () => {
  env.ledger['Monique'] = [
    session(75),
    certificate('MVA-128651-C006', 25),
    invoice('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.deepEqual(
    result.certs.map(function (c) {
      return c.certificateNumber;
    }),
    ['MVA-128651-C010']
  );
});

test('getCertsForStudent sorts certs by seq ascending regardless of ledger row order', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C012', 30),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.deepEqual(
    result.certs.map(function (c) {
      return c.certificateNumber;
    }),
    ['MVA-128651-C006', 'MVA-128651-C010', 'MVA-128651-C012']
  );
});

test('getCertsForStudent presents amount as positive (the approved amount, not the signed ledger value)', () => {
  env.ledger['Monique'] = [certificate('MVA-128651-C006', 25)];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.deepEqual(result.certs, [
    {
      certificateNumber: 'MVA-128651-C006',
      amount: 25,
      servicePeriod: 'Apr 01, 2026',
    },
  ]);
});

test('getCertsForStudent derives servicePeriod from the segment after the em-dash join in Description', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25, 'Individual Tutoring - math — May 2026'),
    certificate('MVA-128651-C010', 50, 'Group Tutoring - Reading — Apr 01, 2026'),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.equal(result.certs[0].servicePeriod, 'May 2026');
  assert.equal(result.certs[1].servicePeriod, 'Apr 01, 2026');
});

test('getCertsForStudent yields servicePeriod="" when the Description has no em-dash separator', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25, 'Group Tutoring - Reading'),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.equal(result.certs[0].servicePeriod, '');
});

test('getCertsForStudent reports {sessionPool:0, certs:[]} for an empty tab', () => {
  // env.ledger['Monique'] not set
  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.deepEqual(result, { sessionPool: 0, certs: [] });
});

test('getCertsForStudent ignores Payment / Charge rows entirely', () => {
  env.ledger['Monique'] = [
    { type: 'Payment', amount: 100, certificateNumber: '', status: '' },
    { type: 'Charge', amount: -25, certificateNumber: '', status: '' },
    session(50),
    certificate('MVA-128651-C006', 25),
  ];

  const result = EarlyInvoice.getCertsForStudent('Monique');

  assert.equal(result.sessionPool, 50);
  assert.equal(result.certs.length, 1);
});

// ─── submit ─────────────────────────────────────────────────────────────────

test('submit hands the selected Certificate rows to InvoiceWriter.draft with the right inputs', () => {
  env.ledger['Monique'] = [
    session(20),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const runDate = new Date('2026-05-16T08:00:00Z');
  EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C010'],
    runDate: runDate,
  });

  assert.equal(env.draftCalls.length, 1);
  const call = env.draftCalls[0];
  assert.deepEqual(call.rosterEntry, {
    studentId: '128651',
    certName: 'Monique Garcia',
    tabName: 'Monique',
  });
  assert.equal(call.settings, env.settings);
  assert.deepEqual(call.counterState, { year: 2026, counter: 7 });
  assert.equal(call.runDate, runDate);
  assert.deepEqual(
    call.certRows.map(function (row) {
      return row.certificateNumber;
    }),
    ['MVA-128651-C006', 'MVA-128651-C010']
  );
});

test('submit sorts the certRows it passes to InvoiceWriter.draft by seq ascending, regardless of request order', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
    certificate('MVA-128651-C012', 30),
  ];

  EarlyInvoice.submit({
    tabName: 'Monique',
    // Tutor ticked these out of order in the picker.
    certificateNumbers: ['MVA-128651-C012', 'MVA-128651-C006'],
    runDate: new Date('2026-05-16T08:00:00Z'),
  });

  assert.deepEqual(
    env.draftCalls[0].certRows.map(function (row) {
      return row.certificateNumber;
    }),
    ['MVA-128651-C006', 'MVA-128651-C012']
  );
});

test('submit persists the new counter state to ConfigGateway', () => {
  env.ledger['Monique'] = [certificate('MVA-128651-C006', 25)];

  EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C006'],
    runDate: new Date('2026-05-16T08:00:00Z'),
  });

  assert.deepEqual(env.counterSet, { year: 2026, counter: 8 });
});

test('submit returns the kernel\'s invoiceNumber and total to the caller', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const result = EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C010'],
    runDate: new Date('2026-05-16T08:00:00Z'),
  });

  assert.deepEqual(result, { invoiceNumber: '2026-007', total: 75 });
});

test('submit allows picking a single Certificate (smallest possible batch)', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C010'],
    runDate: new Date('2026-05-16T08:00:00Z'),
  });

  assert.equal(env.draftCalls[0].certRows.length, 1);
  assert.equal(env.draftCalls[0].certRows[0].certificateNumber, 'MVA-128651-C010');
});

test('submit allows non-contiguous selections (the FIFO carve-out — see Early Invoice in CONTEXT.md)', () => {
  env.ledger['Monique'] = [
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
    certificate('MVA-128651-C012', 30),
  ];

  // Skip C010 in the middle.
  EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C012'],
    runDate: new Date('2026-05-16T08:00:00Z'),
  });

  assert.deepEqual(
    env.draftCalls[0].certRows.map(function (row) {
      return row.certificateNumber;
    }),
    ['MVA-128651-C006', 'MVA-128651-C012']
  );
});

test('submit throws when tabName is missing', () => {
  assert.throws(
    function () {
      EarlyInvoice.submit({ certificateNumbers: ['MVA-128651-C006'] });
    },
    /tabName is required/
  );
});

test('submit throws when no Certificates are picked', () => {
  assert.throws(
    function () {
      EarlyInvoice.submit({ tabName: 'Monique', certificateNumbers: [] });
    },
    /at least one Certificate/
  );
});

test('submit throws when the requested tab belongs to an inactive Student', () => {
  // Inactive Students never make it onto the dialog, but defend the server-side
  // gate too so a stale dialog payload can't slip past.
  assert.throws(
    function () {
      EarlyInvoice.submit({
        tabName: 'Inactive',
        certificateNumbers: ['MVA-999999-C001'],
        runDate: new Date('2026-05-16T08:00:00Z'),
      });
    },
    /no active Student with tab "Inactive"/
  );
});

test('submit throws when a requested Certificate Number is not on the tab', () => {
  env.ledger['Monique'] = [certificate('MVA-128651-C006', 25)];

  assert.throws(
    function () {
      EarlyInvoice.submit({
        tabName: 'Monique',
        certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C999'],
        runDate: new Date('2026-05-16T08:00:00Z'),
      });
    },
    /no Certificate row for "MVA-128651-C999"/
  );
});

test('submit defaults runDate to now when the caller omits it', () => {
  env.ledger['Monique'] = [certificate('MVA-128651-C006', 25)];

  const before = new Date();
  EarlyInvoice.submit({
    tabName: 'Monique',
    certificateNumbers: ['MVA-128651-C006'],
  });
  const after = new Date();

  const passed = env.draftCalls[0].runDate;
  assert.ok(passed instanceof Date);
  assert.ok(passed.getTime() >= before.getTime() && passed.getTime() <= after.getTime());
});
