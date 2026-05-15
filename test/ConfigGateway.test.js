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

test('reads the business block, bill-to block, invoicing email, and default description', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Business Name', 'Michaele LePenske - Online Tutoring'],
    ['Business Subtitle', 'Enrichment tutoring'],
    ['Business Address', '123 Lamp Post Ln, Vista CA'],
    ['Business Phone', '555-0100'],
    ['Bill To Name', 'Mission Vista Academy'],
    ['Bill To Address', '350 Civic Center Dr, Vista CA 92084'],
    ['Invoicing Email', 'invoicing@missionvistaacademy.org'],
    ['Default Line-Item Description', 'Core academics tutoring'],
  ];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.deepEqual(settings.business, {
    name: 'Michaele LePenske - Online Tutoring',
    subtitle: 'Enrichment tutoring',
    address: '123 Lamp Post Ln, Vista CA',
    phone: '555-0100',
  });
  assert.deepEqual(settings.billTo, {
    name: 'Mission Vista Academy',
    address: '350 Civic Center Dr, Vista CA 92084',
  });
  assert.equal(settings.invoicingEmail, 'invoicing@missionvistaacademy.org');
  assert.equal(settings.defaultDescription, 'Core academics tutoring');
});

test('invoice settings beyond the go-live date default to empty when absent', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  const settings = ConfigGateway.getInvoiceSettings();

  assert.deepEqual(settings.business, {
    name: '',
    subtitle: '',
    address: '',
    phone: '',
  });
  assert.deepEqual(settings.billTo, { name: '', address: '' });
  assert.equal(settings.invoicingEmail, '');
  assert.equal(settings.defaultDescription, '');
});

test('getInvoiceCounter parses the {YYYY}-{NNN} Next Invoice Number cell', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Next Invoice Number', '2026-007'],
  ];

  assert.deepEqual(ConfigGateway.getInvoiceCounter(), { year: 2026, counter: 7 });
});

test('getInvoiceCounter throws when the Next Invoice Number cell is missing', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  assert.throws(() => ConfigGateway.getInvoiceCounter(), /Next Invoice Number/);
});

test('getInvoiceCounter throws when Next Invoice Number is not {YYYY}-{NNN}', () => {
  configGrid = [['Next Invoice Number', new Date('2026-05-01')]];

  assert.throws(() => ConfigGateway.getInvoiceCounter(), /Next Invoice Number/);
});

test('setInvoiceCounter writes the padded next number into the Next Invoice Number cell', () => {
  configGrid = [
    ['Go-Live Date', '2026-05-01'],
    ['Next Invoice Number', '2026-007'],
  ];

  ConfigGateway.setInvoiceCounter({ year: 2026, counter: 8 });

  // The value cell is column 2 (1-based) of row 2.
  assert.deepEqual(written, [{ row: 2, col: 2, value: '2026-008' }]);
});

test('the invoice counter round-trips through set then get', () => {
  configGrid = [['Next Invoice Number', '2026-001']];

  ConfigGateway.setInvoiceCounter({ year: 2027, counter: 12 });

  assert.deepEqual(ConfigGateway.getInvoiceCounter(), { year: 2027, counter: 12 });
});

test('getTutorEmail reads the Tutor Email setting', () => {
  configGrid = [['Tutor Email', 'lamp.post.tutoring@gmail.com']];

  assert.equal(ConfigGateway.getTutorEmail(), 'lamp.post.tutoring@gmail.com');
});

test('getTutorEmail returns the empty string when the setting is absent', () => {
  configGrid = [['Go-Live Date', '2026-05-01']];

  assert.equal(ConfigGateway.getTutorEmail(), '');
});
