/**
 * ConfigGateway (I/O) — reads the roster and invoice settings from the Config
 * tab; persists the invoice counter.
 *
 * Roster lookup is built in Slice 2 (#3); Slice 3 (#4) reads the go-live date;
 * the rest of the invoice settings + counter persistence are extended in
 * Slice 4 (#5).
 *
 * Config-tab contract: a tab named `Config` containing —
 *  - a roster block whose header row has the cells `Student ID`, `Cert Name`,
 *    `Tab Name`, `Active?` (order-independent; other columns ignored). Roster
 *    rows run from directly below that header to the first blank `Student ID`
 *    cell.
 *  - an invoice-settings key/value area, anywhere else on the tab: a cell
 *    holding a setting's name, with its value in the cell immediately to the
 *    right. Slice 3 reads `Go-Live Date`; Slice 4 adds the rest.
 */
const CONFIG_TAB = 'Config';

const ConfigGateway = {
  /**
   * @returns {Array<{ studentId: string, certName: string, tabName: string, active: boolean }>}
   */
  getRoster() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG_TAB);
    if (!sheet) {
      throw new Error('ConfigGateway.getRoster: no "' + CONFIG_TAB + '" tab found');
    }
    const values = sheet.getDataRange().getValues();

    let headerRow = -1;
    let cols = null;
    for (let r = 0; r < values.length && headerRow === -1; r++) {
      const cells = values[r].map(function (c) {
        return String(c).trim();
      });
      const studentIdCol = cells.indexOf('Student ID');
      if (studentIdCol !== -1) {
        headerRow = r;
        cols = {
          studentId: studentIdCol,
          certName: cells.indexOf('Cert Name'),
          tabName: cells.indexOf('Tab Name'),
          active: cells.indexOf('Active?'),
        };
      }
    }
    if (headerRow === -1) {
      throw new Error(
        'ConfigGateway.getRoster: no "Student ID" header found on the "' +
          CONFIG_TAB +
          '" tab'
      );
    }

    const roster = [];
    for (let r = headerRow + 1; r < values.length; r++) {
      const row = values[r];
      const studentId = String(row[cols.studentId]).trim();
      if (studentId === '') break; // roster block ends at the first blank row
      roster.push({
        studentId: studentId,
        certName: cols.certName === -1 ? '' : String(row[cols.certName]).trim(),
        tabName: cols.tabName === -1 ? '' : String(row[cols.tabName]).trim(),
        active: cols.active === -1 ? true : isTruthy_(row[cols.active]),
      });
    }
    return roster;
  },

  /**
   * @returns {{ goLiveDate: Date }} the go-live date — intake ignores
   *   certificates dated on/before it (carried over by hand at migration).
   *   Slice 4 (#5) extends this with vendor/business details, the invoicing
   *   address, and the default invoice line-item description.
   */
  getInvoiceSettings() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG_TAB);
    if (!sheet) {
      throw new Error(
        'ConfigGateway.getInvoiceSettings: no "' + CONFIG_TAB + '" tab found'
      );
    }
    const values = sheet.getDataRange().getValues();
    const goLiveRaw = settingValue_(values, 'Go-Live Date');
    if (goLiveRaw == null || goLiveRaw === '') {
      throw new Error(
        'ConfigGateway.getInvoiceSettings: no "Go-Live Date" setting on the "' +
          CONFIG_TAB +
          '" tab'
      );
    }
    return { goLiveDate: asDate_(goLiveRaw, 'Go-Live Date') };
  },

  /**
   * @returns {{ year: number, counter: number }}
   */
  getInvoiceCounter() {
    throw new Error('ConfigGateway.getInvoiceCounter not implemented — Slice 4 (#5)');
  },

  /**
   * @param {{ year: number, counter: number }} state
   */
  setInvoiceCounter(state) {
    throw new Error('ConfigGateway.setInvoiceCounter not implemented — Slice 4 (#5)');
  },
};

/** A Sheets `Active?` cell may be a checkbox boolean or a Yes/No/True string. */
function isTruthy_(value) {
  if (typeof value === 'boolean') return value;
  return /^(true|yes|y|1|active)$/i.test(String(value).trim());
}

/**
 * The cell immediately to the right of the first cell whose trimmed text
 * matches `label` (case-insensitive); null if the label isn't found. Lets the
 * invoice-settings block sit as free-form key/value pairs anywhere on the tab.
 */
function settingValue_(values, label) {
  const want = label.toLowerCase();
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length - 1; c++) {
      if (String(values[r][c]).trim().toLowerCase() === want) {
        return values[r][c + 1];
      }
    }
  }
  return null;
}

/** A settings date cell — a Sheets `Date`, or a date string typed by hand. */
function asDate_(value, label) {
  const date = value instanceof Date ? value : new Date(String(value).trim());
  if (isNaN(date.getTime())) {
    throw new Error(
      'ConfigGateway: "' + label + '" is not a valid date: "' + value + '"'
    );
  }
  return date;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfigGateway;
}
