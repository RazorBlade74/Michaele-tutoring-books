/**
 * PoolCheck.runPoolCheck — Slice 4 (#5) invoice-drafting wiring.
 *
 * runPoolCheck is the I/O wiring module: its collaborators are file-scope
 * globals in Apps Script, and Node sees them as globals too. The test keeps the
 * real pure modules (PoolEngine, InvoiceNumberAllocator, CertificateNumber) and
 * the real InvoiceWriter kernel (Slice 9 (#20) — the five-step invoice sequence
 * that runPoolCheck now delegates to), and injects fakes for the four invoice
 * gateways (Config, Ledger, DocBuilder, Mailer), each recording what it was
 * handed. The existing assertions on the gateway side-effects act as the
 * regression net for the kernel extraction.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');
global.PoolEngine = require('../src/PoolEngine.js');
global.InvoiceNumberAllocator = require('../src/InvoiceNumberAllocator.js');

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
  appendRow(tabName, row) {
    (env.ledger[tabName] = env.ledger[tabName] || []).push(row);
    env.appended.push({ tabName: tabName, row: row });
  },
};
global.InvoiceDocBuilder = {
  toTemplateValues(coveredBatch, config) {
    env.toTemplateValuesCalls.push({ coveredBatch: coveredBatch, config: config });
    const total = coveredBatch.reduce(function (sum, row) {
      return sum + Math.abs(row.amount);
    }, 0);
    return { invoiceNumber: config.invoiceNumber, total: total };
  },
  buildPdf(templateValues) {
    env.buildPdfCalls.push({ templateValues: templateValues });
    return { pdfFor: templateValues.invoiceNumber };
  },
};
global.InvoiceMailer = {
  draftInvoice(options) {
    env.drafts.push(options);
    return { draftFor: options.subject };
  },
};

global.InvoiceWriter = require('../src/InvoiceWriter.js');

const { runPoolCheck } = require('../src/PoolCheck.js');

const RUN_DATE = new Date('2026-05-14T08:00:00Z');

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

test.beforeEach(() => {
  env = {
    roster: [
      { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique', active: true },
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
    counter: { year: 2026, counter: 1 },
    ledger: {},
    appended: [],
    drafts: [],
    buildPdfCalls: [],
    toTemplateValuesCalls: [],
    counterSet: undefined,
  };
});

test('a Student whose pool covers a batch gets a Gmail draft to the invoicing address', () => {
  env.ledger['Monique'] = [
    session(100),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  runPoolCheck(RUN_DATE);

  assert.equal(env.drafts.length, 1);
  assert.equal(env.drafts[0].to, 'invoicing@missionvistaacademy.org');
  assert.equal(env.drafts[0].subject, 'Invoice 2026-001');
  assert.deepEqual(env.drafts[0].pdfBlob, { pdfFor: '2026-001' });
});

test('one Invoice row per Certificate in the batch is written, with Status = Draft', () => {
  env.ledger['Monique'] = [
    session(100),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  runPoolCheck(RUN_DATE);

  assert.deepEqual(env.appended, [
    {
      tabName: 'Monique',
      row: {
        date: RUN_DATE,
        type: 'Invoice',
        description: '2026-001',
        amount: 25,
        certificateNumber: 'MVA-128651-C006',
        status: 'Draft',
      },
    },
    {
      tabName: 'Monique',
      row: {
        date: RUN_DATE,
        type: 'Invoice',
        description: '2026-001',
        amount: 50,
        certificateNumber: 'MVA-128651-C010',
        status: 'Draft',
      },
    },
  ]);
});

test('the advanced invoice counter is persisted to Config', () => {
  env.ledger['Monique'] = [session(25), certificate('MVA-128651-C006', 25)];

  runPoolCheck(RUN_DATE);

  assert.deepEqual(env.counterSet, { year: 2026, counter: 2 });
});

test('runPoolCheck returns a structured result of what was drafted', () => {
  env.ledger['Monique'] = [
    session(100),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C010', 50),
  ];

  const result = runPoolCheck(RUN_DATE);

  assert.deepEqual(result, {
    drafted: [
      {
        tabName: 'Monique',
        invoiceNumber: '2026-001',
        certificateNumbers: ['MVA-128651-C006', 'MVA-128651-C010'],
        total: 75,
      },
    ],
  });
});

test('a Student with no covered batch drafts nothing and leaves the counter untouched', () => {
  env.ledger['Monique'] = [session(10), certificate('MVA-128651-C006', 25)];

  const result = runPoolCheck(RUN_DATE);

  assert.equal(result.drafted.length, 0);
  assert.equal(env.drafts.length, 0);
  assert.equal(env.appended.length, 0);
  assert.equal(env.counterSet, undefined);
});

test('inactive Students are skipped even when their pool covers a batch', () => {
  env.roster = [
    { studentId: '999999', certName: 'Old Student', tabName: 'Inactive', active: false },
  ];
  env.ledger['Inactive'] = [session(25), certificate('MVA-999999-C001', 25)];

  const result = runPoolCheck(RUN_DATE);

  assert.equal(result.drafted.length, 0);
  assert.equal(env.appended.length, 0);
});

test('each Student gets the next sequential invoice number in one run', () => {
  env.roster = [
    { studentId: '128651', certName: 'Monique Garcia', tabName: 'Monique', active: true },
    { studentId: '56239', certName: 'Phoebe Hansen', tabName: 'Phoebe', active: true },
  ];
  env.ledger['Monique'] = [session(25), certificate('MVA-128651-C006', 25)];
  env.ledger['Phoebe'] = [session(40), certificate('MVA-56239-C062', 40)];

  const result = runPoolCheck(RUN_DATE);

  assert.deepEqual(
    result.drafted.map((d) => d.invoiceNumber),
    ['2026-001', '2026-002']
  );
  assert.deepEqual(env.counterSet, { year: 2026, counter: 3 });
});

test('a Covered Batch of a single Certificate produces a one-line invoice and one Invoice row', () => {
  env.ledger['Monique'] = [session(25), certificate('MVA-128651-C006', 25)];

  const result = runPoolCheck(RUN_DATE);

  assert.deepEqual(result.drafted[0].certificateNumbers, ['MVA-128651-C006']);
  assert.equal(env.appended.length, 1);
  assert.equal(env.appended[0].row.certificateNumber, 'MVA-128651-C006');
});

test('the doc builder is handed the invoice settings and the Student name from Config', () => {
  env.ledger['Monique'] = [session(25), certificate('MVA-128651-C006', 25)];

  runPoolCheck(RUN_DATE);

  assert.deepEqual(env.toTemplateValuesCalls[0].config, {
    invoiceNumber: '2026-001',
    invoiceDate: RUN_DATE,
    business: env.settings.business,
    billTo: env.settings.billTo,
    studentName: 'Monique Garcia',
    defaultDescription: 'Core academics tutoring',
  });
  assert.deepEqual(env.buildPdfCalls[0].templateValues, {
    invoiceNumber: '2026-001',
    total: 25,
  });
});

test('an already-invoiced Certificate is excluded from the next run', () => {
  env.ledger['Monique'] = [
    session(100),
    certificate('MVA-128651-C006', 25),
    { type: 'Invoice', amount: 25, certificateNumber: 'MVA-128651-C006', status: 'Draft' },
    certificate('MVA-128651-C010', 50),
  ];

  const result = runPoolCheck(RUN_DATE);

  // C006 is already invoiced; the run only drafts C010.
  assert.deepEqual(result.drafted[0].certificateNumbers, ['MVA-128651-C010']);
});
