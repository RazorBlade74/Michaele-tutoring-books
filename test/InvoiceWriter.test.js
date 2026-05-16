/**
 * InvoiceWriter.draft — Slice 9 (#20) shared invoice-drafting kernel.
 *
 * InvoiceWriter is pure orchestration over four I/O collaborators
 * (InvoiceNumberAllocator, InvoiceDocBuilder, InvoiceMailer, LedgerGateway).
 * The test mocks all four as file-scope globals, drives the public function,
 * and asserts on what each collaborator was called with — the same shape
 * PoolCheck.test.js uses for the wiring it now delegates to.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let env;
global.InvoiceNumberAllocator = {
  allocate(state, year) {
    env.allocateCalls.push({ state: state, year: year });
    const seq = state.counter;
    return {
      invoiceNumber: year + '-' + ('00' + seq).slice(-3),
      state: { year: year, counter: seq + 1 },
    };
  },
};
global.InvoiceDocBuilder = {
  toTemplateValues(certRows, config) {
    env.toTemplateValuesCalls.push({ certRows: certRows, config: config });
    const total = certRows.reduce(function (sum, row) {
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
global.LedgerGateway = {
  appendRow(tabName, row) {
    env.appended.push({ tabName: tabName, row: row });
  },
};

const InvoiceWriter = require('../src/InvoiceWriter.js');

const RUN_DATE = new Date('2026-05-16T08:00:00Z');
const SETTINGS = {
  business: {
    name: 'Michaele LePenske - Online Tutoring',
    subtitle: 'Enrichment tutoring',
    address: '123 Lamp Post Ln',
    phone: '555-0100',
  },
  billTo: { name: 'Mission Vista Academy', address: '350 Civic Center Dr, Vista CA 92084' },
  invoicingEmail: 'invoicing@missionvistaacademy.org',
  defaultDescription: 'Core academics tutoring',
};
const ROSTER_ENTRY = {
  studentId: '128651',
  certName: 'Monique Garcia',
  tabName: 'Monique',
  active: true,
};

function certRow(certificateNumber, amount) {
  return {
    type: 'Certificate',
    description: 'Group Tutoring - Reading — Apr 01, 2026',
    amount: -Math.abs(amount),
    certificateNumber: certificateNumber,
    status: '',
  };
}

test.beforeEach(() => {
  env = {
    allocateCalls: [],
    toTemplateValuesCalls: [],
    buildPdfCalls: [],
    drafts: [],
    appended: [],
  };
});

test('allocate is called with the passed counter state and the runDate year', () => {
  InvoiceWriter.draft({
    certRows: [certRow('MVA-128651-C006', 25)],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 7 },
    runDate: RUN_DATE,
  });

  assert.deepEqual(env.allocateCalls, [
    { state: { year: 2026, counter: 7 }, year: 2026 },
  ]);
});

test('toTemplateValues is called with the cert rows + the invoice config from settings/roster', () => {
  InvoiceWriter.draft({
    certRows: [certRow('MVA-128651-C006', 25)],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

  assert.equal(env.toTemplateValuesCalls.length, 1);
  assert.deepEqual(env.toTemplateValuesCalls[0].certRows, [certRow('MVA-128651-C006', 25)]);
  assert.deepEqual(env.toTemplateValuesCalls[0].config, {
    invoiceNumber: '2026-001',
    invoiceDate: RUN_DATE,
    business: SETTINGS.business,
    billTo: SETTINGS.billTo,
    studentName: 'Monique Garcia',
    defaultDescription: 'Core academics tutoring',
  });
});

test('buildPdf is called with the template values returned by toTemplateValues', () => {
  InvoiceWriter.draft({
    certRows: [certRow('MVA-128651-C006', 25)],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

  assert.equal(env.buildPdfCalls.length, 1);
  assert.deepEqual(env.buildPdfCalls[0].templateValues, {
    invoiceNumber: '2026-001',
    total: 25,
  });
});

test('draftInvoice is called with the right subject, body, recipient, and PDF', () => {
  InvoiceWriter.draft({
    certRows: [certRow('MVA-128651-C006', 25)],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

  assert.equal(env.drafts.length, 1);
  assert.deepEqual(env.drafts[0], {
    to: 'invoicing@missionvistaacademy.org',
    subject: 'Invoice 2026-001',
    body:
      'Please find attached invoice 2026-001 from ' +
      'Michaele LePenske - Online Tutoring.',
    pdfBlob: { pdfFor: '2026-001' },
  });
});

test('one appendRow per cert: Type=Invoice, Status=Draft, positive Amount, cert# in Certificate Number, Description=invoiceNumber', () => {
  InvoiceWriter.draft({
    certRows: [
      certRow('MVA-128651-C006', 25),
      certRow('MVA-128651-C010', 50),
    ],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

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

test('returns {invoiceNumber, total, newCounterState} matching what the kernel produced', () => {
  const result = InvoiceWriter.draft({
    certRows: [
      certRow('MVA-128651-C006', 25),
      certRow('MVA-128651-C010', 50),
    ],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

  assert.deepEqual(result, {
    invoiceNumber: '2026-001',
    total: 75,
    newCounterState: { year: 2026, counter: 2 },
  });
});

test('persists nothing itself — counterState advancement is returned, not written', () => {
  // The kernel must not call ConfigGateway.setInvoiceCounter; the caller decides
  // when to persist (PoolCheck batches across the loop; EarlyInvoice persists
  // immediately).
  global.ConfigGateway = {
    setInvoiceCounter() {
      throw new Error('InvoiceWriter must not persist the counter itself');
    },
  };

  InvoiceWriter.draft({
    certRows: [certRow('MVA-128651-C006', 25)],
    rosterEntry: ROSTER_ENTRY,
    settings: SETTINGS,
    counterState: { year: 2026, counter: 1 },
    runDate: RUN_DATE,
  });

  delete global.ConfigGateway;
});
