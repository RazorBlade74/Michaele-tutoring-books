/**
 * InvoiceDocBuilder — Slice 4 (#5).
 *
 * `toTemplateValues` is a pure mapping and is tested directly. `buildPdf` is
 * I/O: its collaborators (`DriveApp`, `DocumentApp`, `Utilities`, `Session`)
 * are Apps Script file-scope globals, faked here to record the copy/fill/export
 * flow. Each test file runs in its own process, so these globals don't leak.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const InvoiceDocBuilder = require('../src/InvoiceDocBuilder.js');

function certRow(certificateNumber, amount, description) {
  return {
    date: '3/25/2026',
    type: 'Certificate',
    description: description,
    amount: -Math.abs(amount),
    certificateNumber: certificateNumber,
    status: '',
  };
}

const config = {
  invoiceNumber: '2026-001',
  invoiceDate: new Date('2026-05-14T12:00:00Z'),
  vendor: {
    name: 'Michaele LePenske - Online Tutoring',
    address: '123 Lamp Post Ln, Vista CA',
    email: 'lamp.post.tutoring@gmail.com',
    phone: '555-0100',
  },
  invoicingEmail: 'invoicing@missionvistaacademy.org',
  defaultDescription: 'Core academics tutoring',
};

test('maps each Certificate in the batch to one line item', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [
      certRow('MVA-128651-C006', 25, 'Group Tutoring - 1 Hour — Apr 01, 2026'),
      certRow('MVA-128651-C010', 50, 'Group Tutoring - 1 Hour — May 2026'),
    ],
    config
  );

  assert.deepEqual(values.lineItems, [
    {
      description: 'Core academics tutoring',
      date: 'Apr 01, 2026',
      po: 'MVA-128651-C006',
      amount: 25,
    },
    {
      description: 'Core academics tutoring',
      date: 'May 2026',
      po: 'MVA-128651-C010',
      amount: 50,
    },
  ]);
});

test('carries the invoice number, date, vendor block, and bill-to address through', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [certRow('MVA-128651-C006', 25, 'Tutoring — Apr 01, 2026')],
    config
  );

  assert.equal(values.invoiceNumber, '2026-001');
  assert.equal(values.invoiceDate, config.invoiceDate);
  assert.deepEqual(values.vendor, config.vendor);
  assert.equal(values.invoicingEmail, 'invoicing@missionvistaacademy.org');
});

test('totals the line-item amounts, cent-exact', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [
      certRow('MVA-128651-C006', 25.1, 'a — b'),
      certRow('MVA-128651-C010', 50.2, 'c — d'),
    ],
    config
  );

  assert.equal(values.total, 75.3);
});

test('the line-item amount is the positive billed amount, not the negative ledger amount', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [certRow('MVA-128651-C006', 25, 'a — b')],
    config
  );

  assert.equal(values.lineItems[0].amount, 25);
});

test('a single-Certificate batch still produces a valid one-line invoice', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [certRow('MVA-128651-C006', 25, 'Tutoring — Apr 01, 2026')],
    config
  );

  assert.equal(values.lineItems.length, 1);
  assert.equal(values.total, 25);
});

test('a Description with no service-period segment yields an empty date', () => {
  const values = InvoiceDocBuilder.toTemplateValues(
    [certRow('MVA-128651-C006', 25, 'Group Tutoring')],
    config
  );

  assert.equal(values.lineItems[0].date, '');
});

// --- buildPdf I/O ---

function fakeRow(text) {
  return {
    _text: text,
    getText() {
      return this._text;
    },
    replaceText(token, value) {
      this._text = this._text.split(token).join(String(value));
    },
    copy() {
      return fakeRow(text);
    },
  };
}

function fakeTable(rows) {
  return {
    rows: rows,
    getNumRows() {
      return this.rows.length;
    },
    getRow(i) {
      return this.rows[i];
    },
    insertTableRow(index, row) {
      this.rows.splice(index, 0, row);
      return row;
    },
    removeRow(index) {
      this.rows.splice(index, 1);
    },
  };
}

function installBuildPdfFakes() {
  const io = {
    templateDocId: 'template-doc-id',
    invoicesFolderId: 'invoices-folder-id',
    bodyReplacements: [],
    createdFiles: [],
  };
  const templateRow = fakeRow('{{description}}|{{date}}|{{po}}|{{amount}}');
  io.table = fakeTable([templateRow]);
  io.body = {
    replaceText(token, value) {
      io.bodyReplacements.push({ token: token, value: String(value) });
    },
    getTables() {
      return [io.table];
    },
  };
  global.DriveApp = {
    getFolderById(id) {
      io.folderRequested = id;
      return {
        createFile(blob) {
          io.createdFiles.push(blob);
        },
      };
    },
    getFileById(id) {
      if (id === io.templateDocId) {
        return {
          makeCopy(name, folder) {
            io.copy = { name: name, folder: folder, trashed: false };
            return {
              getId() {
                return 'copy-id';
              },
              setTrashed(value) {
                io.copy.trashed = value;
              },
            };
          },
        };
      }
      if (id === 'copy-id') {
        return {
          getAs(type) {
            io.exportedType = type;
            return {
              _name: 'invoice-pdf',
              setName(n) {
                this._name = n;
                return this;
              },
            };
          },
        };
      }
      throw new Error('unexpected getFileById: ' + id);
    },
  };
  global.DocumentApp = {
    openById(id) {
      io.openedDocId = id;
      return {
        getBody() {
          return io.body;
        },
        saveAndClose() {
          io.saved = true;
        },
      };
    },
  };
  global.Utilities = {
    formatDate() {
      return 'May 14, 2026';
    },
  };
  global.Session = {
    getScriptTimeZone() {
      return 'America/Los_Angeles';
    },
  };
  return io;
}

const templateValues = {
  invoiceNumber: '2026-001',
  invoiceDate: new Date('2026-05-14T12:00:00Z'),
  vendor: {
    name: 'Michaele LePenske - Online Tutoring',
    address: '123 Lamp Post Ln, Vista CA',
    email: 'lamp.post.tutoring@gmail.com',
    phone: '555-0100',
  },
  invoicingEmail: 'invoicing@missionvistaacademy.org',
  lineItems: [
    { description: 'Core academics tutoring', date: 'Apr 01, 2026', po: 'MVA-128651-C006', amount: 25 },
    { description: 'Core academics tutoring', date: 'May 2026', po: 'MVA-128651-C010', amount: 50 },
  ],
  total: 75,
};

test('buildPdf copies the template into the Invoices folder, named for the invoice', () => {
  const io = installBuildPdfFakes();

  InvoiceDocBuilder.buildPdf(templateValues, {
    templateDocId: io.templateDocId,
    invoicesFolderId: io.invoicesFolderId,
  });

  assert.equal(io.copy.name, 'Invoice 2026-001');
  assert.equal(io.folderRequested, 'invoices-folder-id');
});

test('buildPdf replaces every scalar token in the Doc body', () => {
  const io = installBuildPdfFakes();

  InvoiceDocBuilder.buildPdf(templateValues, {
    templateDocId: io.templateDocId,
    invoicesFolderId: io.invoicesFolderId,
  });

  const replaced = {};
  io.bodyReplacements.forEach(function (r) {
    replaced[r.token] = r.value;
  });
  assert.deepEqual(replaced, {
    '{{invoiceNumber}}': '2026-001',
    '{{invoiceDate}}': 'May 14, 2026',
    '{{vendorName}}': 'Michaele LePenske - Online Tutoring',
    '{{vendorAddress}}': '123 Lamp Post Ln, Vista CA',
    '{{vendorEmail}}': 'lamp.post.tutoring@gmail.com',
    '{{vendorPhone}}': '555-0100',
    '{{billToEmail}}': 'invoicing@missionvistaacademy.org',
    '{{total}}': '$75.00',
  });
});

test('buildPdf clones the line-item row once per line item and drops the template row', () => {
  const io = installBuildPdfFakes();

  InvoiceDocBuilder.buildPdf(templateValues, {
    templateDocId: io.templateDocId,
    invoicesFolderId: io.invoicesFolderId,
  });

  assert.deepEqual(
    io.table.rows.map(function (row) {
      return row.getText();
    }),
    [
      'Core academics tutoring|Apr 01, 2026|MVA-128651-C006|$25.00',
      'Core academics tutoring|May 2026|MVA-128651-C010|$50.00',
    ]
  );
});

test('buildPdf exports a PDF into the Invoices folder, trashes the working copy, and returns the blob', () => {
  const io = installBuildPdfFakes();

  const blob = InvoiceDocBuilder.buildPdf(templateValues, {
    templateDocId: io.templateDocId,
    invoicesFolderId: io.invoicesFolderId,
  });

  assert.equal(io.exportedType, 'application/pdf');
  assert.equal(io.createdFiles.length, 1);
  assert.equal(io.createdFiles[0]._name, 'Invoice 2026-001.pdf');
  assert.equal(io.copy.trashed, true);
  assert.equal(blob, io.createdFiles[0]);
});
