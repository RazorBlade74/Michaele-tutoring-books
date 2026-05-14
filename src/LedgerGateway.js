/**
 * LedgerGateway (I/O) — reads and writes rows on a Student Ledger tab.
 *
 * Stays dumb: no domain logic, just row in / row out. Built in Slice 2 (#3).
 *
 * Ledger-tab contract: row 1 is a header row containing the cells `Date`,
 * `Type`, `Description`, `Amount`, `Certificate Number`, `Status`
 * (order-independent; other columns are preserved on read and left blank on
 * append).
 */
const LEDGER_HEADERS = {
  date: 'Date',
  type: 'Type',
  description: 'Description',
  amount: 'Amount',
  certificateNumber: 'Certificate Number',
  status: 'Status',
};

const LedgerGateway = {
  /**
   * @param {string} tabName the Student's tab
   * @returns {Array<{ date: *, type: string, description: *, amount: *, certificateNumber: string, status: string }>}
   *   the ledger rows (header and fully-blank rows excluded)
   */
  readRows(tabName) {
    const sheet = getSheet_(tabName);
    const cols = columnMap_(sheet, tabName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    return values
      .filter(function (row) {
        return row.some(function (cell) {
          return String(cell).trim() !== '';
        });
      })
      .map(function (row) {
        return {
          date: row[cols.date],
          type: String(row[cols.type]).trim(),
          description: row[cols.description],
          amount: row[cols.amount],
          certificateNumber: String(row[cols.certificateNumber]).trim(),
          status: String(row[cols.status]).trim(),
        };
      });
  },

  /**
   * @param {string} tabName the Student's tab
   * @param {{ date: *, type: string, description: *, amount: *, certificateNumber: string, status: string }} row
   *   the row to append
   */
  appendRow(tabName, row) {
    const sheet = getSheet_(tabName);
    const cols = columnMap_(sheet, tabName);
    const out = new Array(sheet.getLastColumn()).fill('');
    out[cols.date] = row.date;
    out[cols.type] = row.type;
    out[cols.description] = row.description;
    out[cols.amount] = row.amount;
    out[cols.certificateNumber] = row.certificateNumber;
    out[cols.status] = row.status;
    sheet.appendRow(out);
  },
};

function getSheet_(tabName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(tabName);
  if (!sheet) {
    throw new Error('LedgerGateway: no tab named "' + tabName + '"');
  }
  return sheet;
}

/** Maps each ledger field to its 0-based column index on `sheet`. */
function columnMap_(sheet, tabName) {
  const lastColumn = sheet.getLastColumn();
  const header = lastColumn
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (c) {
        return String(c).trim();
      })
    : [];
  const cols = {};
  Object.keys(LEDGER_HEADERS).forEach(function (field) {
    const idx = header.indexOf(LEDGER_HEADERS[field]);
    if (idx === -1) {
      throw new Error(
        'LedgerGateway: tab "' +
          tabName +
          '" is missing the "' +
          LEDGER_HEADERS[field] +
          '" column'
      );
    }
    cols[field] = idx;
  });
  return cols;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LedgerGateway;
}
