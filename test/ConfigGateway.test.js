/**
 * ConfigGateway.getInvoiceSettings — Slice 3 (#4) go-live-date read.
 *
 * I/O module: `SpreadsheetApp` is a file-scope global in Apps Script. The test
 * fakes it with a canned Config-tab grid and asserts the key/value lookup of
 * the invoice-settings area.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

let configGrid;
global.SpreadsheetApp = {
  getActive() {
    return {
      getSheetByName(name) {
        if (name !== 'Config') return null;
        return {
          getDataRange() {
            return { getValues: () => configGrid };
          },
        };
      },
    };
  },
};

const ConfigGateway = require('../src/ConfigGateway.js');

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
