/**
 * EarlyInvoice — the tutor-initiated invoice-drafting path.
 *
 * The daily PoolCheck is strict-FIFO and only drafts when the Session Pool
 * fully covers the oldest uninvoiced Certificate. The tutor sometimes needs
 * to bill MVA ahead of delivered sessions (a brand-new cert; a partially
 * covered one). EarlyInvoice is the manual override: she picks a Student,
 * ticks any combination of that Student's uninvoiced Certificates, and the
 * server hands them to the same `InvoiceWriter.draft` kernel PoolCheck uses.
 * To MVA the resulting invoice is indistinguishable from an automated one;
 * the only difference is the trigger and the FIFO carve-out (see CONTEXT.md
 * "Early Invoice").
 *
 * Three public functions back the modal dialog (top-level wrappers below
 * each carry an `earlyInvoice` prefix so they're safe to call as
 * `google.script.run.earlyInvoiceGetStudents()` without colliding in the
 * one-global-scope Apps Script project). Built in Slice 9 (#20).
 */
const SERVICE_PERIOD_SEPARATOR = ' — '; // the em-dash join Intake writes into a cert Description

const EarlyInvoice = {
  /**
   * Active roster entries, in roster order, with the `active` flag dropped —
   * the dialog only ever shows active Students and never branches on it.
   * @returns {Array<{ studentId: string, certName: string, tabName: string }>}
   */
  getStudents() {
    return ConfigGateway.getRoster()
      .filter(function (entry) {
        return entry.active;
      })
      .map(function (entry) {
        return {
          studentId: entry.studentId,
          certName: entry.certName,
          tabName: entry.tabName,
        };
      });
  },

  /**
   * The dialog payload for one Student: current Session Pool total + every
   * uninvoiced Certificate on that tab, sorted by `seq` ascending so the
   * picker reads in the same order as the automated path.
   *
   * @param {string} tabName the Student tab name
   * @returns {{
   *   sessionPool: number,
   *   certs: Array<{
   *     certificateNumber: string,
   *     amount: number,
   *     servicePeriod: string
   *   }>
   * }}
   */
  getCertsForStudent(tabName) {
    const rows = LedgerGateway.readRows(tabName);
    let poolCents = 0;
    const certificateRows = [];
    const invoicedCertNumbers = {};
    rows.forEach(function (row) {
      const type = String(row.type).trim();
      if (type === 'Session') {
        poolCents += centsOf_(row.amount);
      } else if (type === 'Certificate') {
        certificateRows.push(row);
      } else if (type === 'Invoice' && row.certificateNumber) {
        invoicedCertNumbers[row.certificateNumber] = true;
      }
    });

    const uninvoiced = certificateRows
      .filter(function (row) {
        return !invoicedCertNumbers[row.certificateNumber];
      })
      .sort(function (a, b) {
        return (
          CertificateNumber.parse(a.certificateNumber).seq -
          CertificateNumber.parse(b.certificateNumber).seq
        );
      });

    return {
      sessionPool: poolCents / 100,
      certs: uninvoiced.map(function (row) {
        return {
          certificateNumber: row.certificateNumber,
          amount: Math.abs(centsOf_(row.amount)) / 100,
          servicePeriod: servicePeriodOf_(row.description),
        };
      }),
    };
  },

  /**
   * Draft one Early Invoice for the picked Certificates and advance the
   * shared invoice counter. Returns the counter that was burned + the dollar
   * total so the dialog can echo them back to the tutor.
   *
   * @param {{
   *   tabName: string,
   *   certificateNumbers: Array<string>,
   *   runDate: (Date|undefined)
   * }} options
   * @returns {{ invoiceNumber: string, total: number }}
   */
  submit(options) {
    if (!options || !options.tabName) {
      throw new Error('EarlyInvoice.submit: tabName is required');
    }
    const requested = (options.certificateNumbers || []).slice();
    if (requested.length === 0) {
      throw new Error('EarlyInvoice.submit: pick at least one Certificate');
    }
    const now = options.runDate || new Date();

    const rosterEntry = EarlyInvoice.getStudents().filter(function (entry) {
      return entry.tabName === options.tabName;
    })[0];
    if (!rosterEntry) {
      throw new Error(
        'EarlyInvoice.submit: no active Student with tab "' + options.tabName + '"'
      );
    }

    // Index Certificate rows by cert# so the request order is irrelevant;
    // the kernel then bills them in seq order for a stable invoice layout.
    const certByNumber = {};
    LedgerGateway.readRows(options.tabName).forEach(function (row) {
      if (String(row.type).trim() === 'Certificate' && row.certificateNumber) {
        certByNumber[row.certificateNumber] = row;
      }
    });
    const certRows = requested.map(function (certNumber) {
      const row = certByNumber[certNumber];
      if (!row) {
        throw new Error(
          'EarlyInvoice.submit: no Certificate row for "' +
            certNumber +
            '" on tab "' +
            options.tabName +
            '"'
        );
      }
      return row;
    });
    certRows.sort(function (a, b) {
      return (
        CertificateNumber.parse(a.certificateNumber).seq -
        CertificateNumber.parse(b.certificateNumber).seq
      );
    });

    const settings = ConfigGateway.getInvoiceSettings();
    const counterState = ConfigGateway.getInvoiceCounter();

    const writeResult = InvoiceWriter.draft({
      certRows: certRows,
      rosterEntry: rosterEntry,
      settings: settings,
      counterState: counterState,
      runDate: now,
    });

    ConfigGateway.setInvoiceCounter(writeResult.newCounterState);

    return { invoiceNumber: writeResult.invoiceNumber, total: writeResult.total };
  },
};

/** A dollar amount as integer cents — keeps coverage comparisons exact. */
function centsOf_(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

/** Service-period label — the segment after the em-dash join in the Description. */
function servicePeriodOf_(description) {
  const text = String(description == null ? '' : description);
  const idx = text.lastIndexOf(SERVICE_PERIOD_SEPARATOR);
  return idx === -1 ? '' : text.slice(idx + SERVICE_PERIOD_SEPARATOR.length).trim();
}

/**
 * Top-level menu-bound entry: shows the modal dialog from the Lamp Post
 * Tutoring custom menu. Apps Script binds menu items by top-level function
 * name, so this exists outside the EarlyInvoice object.
 */
function openEarlyInvoiceDialog() {
  const html = HtmlService.createHtmlOutputFromFile('EarlyInvoiceDialog')
    .setWidth(520)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Generate early invoice');
}

/**
 * Top-level wrappers for the three google.script.run calls the dialog makes.
 * The `earlyInvoice` prefix keeps these from colliding in the one-global-scope
 * Apps Script project.
 */
function earlyInvoiceGetStudents() {
  return EarlyInvoice.getStudents();
}

function earlyInvoiceGetCertsForStudent(tabName) {
  return EarlyInvoice.getCertsForStudent(tabName);
}

function earlyInvoiceSubmit(options) {
  return EarlyInvoice.submit(options);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EarlyInvoice: EarlyInvoice,
    openEarlyInvoiceDialog: openEarlyInvoiceDialog,
    earlyInvoiceGetStudents: earlyInvoiceGetStudents,
    earlyInvoiceGetCertsForStudent: earlyInvoiceGetCertsForStudent,
    earlyInvoiceSubmit: earlyInvoiceSubmit,
  };
}
