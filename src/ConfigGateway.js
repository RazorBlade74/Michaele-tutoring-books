/**
 * ConfigGateway (I/O) — reads the roster and invoice settings from the Config
 * tab; persists the invoice counter.
 *
 * Roster lookup is built in Slice 2 (#3); invoice settings + counter
 * persistence are extended in Slice 4 (#5).
 *
 * Config-tab contract (Slice 2): a tab named `Config` containing a roster block
 * whose header row has the cells `Student ID`, `Cert Name`, `Tab Name`,
 * `Active?` (order-independent; other columns ignored). Roster rows run from
 * directly below that header to the first blank `Student ID` cell — the rest of
 * the tab (invoice settings) is left for Slice 4.
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
   * @returns {object} vendor/business details, invoicing email, default
   *   line-item description, go-live date
   */
  getInvoiceSettings() {
    throw new Error('ConfigGateway.getInvoiceSettings not implemented — Slice 4 (#5)');
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfigGateway;
}
