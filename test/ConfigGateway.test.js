/**
 * ConfigGateway — Slice 3 (#4) go-live-date read; Slice 4 (#5) invoice
 * settings + invoice-counter get/set.
 *
 * I/O module: `SpreadsheetApp` is a file-scope global in Apps Script. The test
 * fakes it with a canned Config-tab grid; `getRange().setValue()` writes back
 * into that grid and is captured in `written` so the counter round-trip can be
 * asserted.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let configGrid;
let written;
global.SpreadsheetApp = {
  getActive() {
    return {
      getSheetByName(name) {
        if (name !== 'Config') return null;
        return {
          getDataRange() {
            return { getValues: () => configGrid };
          },
          getRange(row, col) {
            return {
              setValue(value) {
                written.push({ row: row, col: col, value: value });
                configGrid[row - 1][col - 1] = value;
              },
            };
          },
        };
      },
    };
  },
};

const ConfigGateway = require('../src/ConfigGateway.js');

test.beforeEach(() => {
  written = [];
});

test('reads the Go-Live Date from the invoice-settings key/value area', () => {
  configGrid = [
    ['Student ID', 'Cert Name', 'Tab Name', 'Active?'],
    ['128651', 'M Garcia', 'Monique', true],
    ['', '', '', ''],
    ['Go-Live Date', new Date('2026-05-01')],
  ];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.equal(settings.goLiveDate.getTime(), new Date('2026-05-01').getTime());
});

test('accepts a hand-typed date string for Go-Live Date', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.equal(settings.goLiveDate.getTime(), new Date('2026-05-01').getTime());
});

test('the Go-Live Date label match is case-insensitive', () => {
  configGrid = [['go-live date', new Date('2026-05-01')]];

  assert.doesNotThrow(() => ConfigGateway.getInvoiceSettings());
});

test('throws when the Config tab has no Go-Live Date setting', () => {
  configGrid = [
    ['Student ID', 'Cert Name'],
    ['128651', 'M Garcia'],
  ];

  assert.throws(() => ConfigGateway.getInvoiceSettings(), /Go-Live Date/);
});

test('throws when Go-Live Date is present but not a valid date', () => {
  configGrid = [['Go-Live Date', 'not a date']];

  assert.throws(() => ConfigGateway.getInvoiceSettings(), /not a valid date/);
});

test('reads the vendor block, invoicing email, default description, and Drive ids', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Vendor Name', 'Michaele LePenske - Online Tutoring'],
    ['Vendor Address', '123 Lamp Post Ln, Vista CA'],
    ['Vendor Email', 'lamp.post.tutoring@gmail.com'],
    ['Vendor Phone', '555-0100'],
    ['Invoicing Email', 'invoicing@missionvistaacademy.org'],
    ['Default Line-Item Description', 'Core academics tutoring'],
    ['Invoice Template Doc ID', 'doc-template-id'],
    ['Invoices Folder ID', 'invoices-folder-id'],
  ];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.deepEqual(settings.vendor, {
    name: 'Michaele LePenske - Online Tutoring',
    address: '123 Lamp Post Ln, Vista CA',
    email: 'lamp.post.tutoring@gmail.com',
    phone: '555-0100',
  });
  assert.equal(settings.invoicingEmail, 'invoicing@missionvistaacademy.org');
  assert.equal(settings.defaultDescription, 'Core academics tutoring');
  assert.equal(settings.templateDocId, 'doc-template-id');
  assert.equal(settings.invoicesFolderId, 'invoices-folder-id');
});

test('invoice settings beyond the go-live date default to empty when absent', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.deepEqual(settings.vendor, { name: '', address: '', email: '', phone: '' });
  assert.equal(settings.invoicingEmail, '');
  assert.equal(settings.defaultDescription, '');
  assert.equal(settings.templateDocId, '');
  assert.equal(settings.invoicesFolderId, '');
});

test('getInvoiceCounter parses the {YYYY}-{NNN} counter cell', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Invoice Counter', '2026-007'],
  ];

  assert.deepEqual(ConfigGateway.getInvoiceCounter(), { year: 2026, counter: 7 });
});

test('getInvoiceCounter throws when the counter cell is missing', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  assert.throws(() => ConfigGateway.getInvoiceCounter(), /Invoice Counter/);
});

test('getInvoiceCounter throws when the counter cell is not {YYYY}-{NNN}', () => {
  configGrid = [['Invoice Counter', new Date('2026-05-01')]];

  assert.throws(() => ConfigGateway.getInvoiceCounter(), /Invoice Counter/);
});

test('setInvoiceCounter writes the padded next number into the counter cell', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Invoice Counter', '2026-007'],
  ];

  ConfigGateway.setInvoiceCounter({ year: 2026, counter: 8 });

  // The value cell is column 2 (1-based) of row 2.
  assert.deepEqual(written, [{ row: 2, col: 2, value: '2026-008' }]);
});

test('the invoice counter round-trips through set then get', () => {
  configGrid = [['Invoice Counter', '2026-001']];

  ConfigGateway.setInvoiceCounter({ year: 2027, counter: 12 });

  assert.deepEqual(ConfigGateway.getInvoiceCounter(), { year: 2027, counter: 12 });
});
