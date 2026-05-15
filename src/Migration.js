/**
 * Migration — read-only dry run for the hand-curated go-live carryover.
 *
 * For each active Student in the roster, summarises the current ledger as
 * PoolEngine sees it: the Session Pool total, the uninvoiced Certificates in
 * receipt order, the Covered Batch a real run would draft, and the dollar
 * total of that batch. Writes nothing — no Gmail draft, no row appended, no
 * counter advanced. Built in Slice 6 (#7) to sanity-check carryover entries
 * before the daily trigger runs for real.
 */
const Migration = {
  /**
   * @returns {{ students: Array<{
   *   studentId: string,
   *   tabName: string,
   *   sessionPool: number,
   *   uninvoicedCertificates: Array<{ certificateNumber: string, amount: number }>,
   *   wouldDraftBatch: Array<string>,
   *   wouldInvoiceTotal: number
   * }> }} the dry-run report
   */
  run() {
    const students = ConfigGateway.getRoster()
      .filter(function (entry) {
        return entry.active;
      })
      .map(function (entry) {
        return summariseStudent_(entry);
      });
    return { students: students };
  },

  /**
   * @param {object} report a value returned by `Migration.run`
   * @returns {string} the report rendered as a human-readable text block
   */
  formatReport(report) {
    const students = (report && report.students) || [];
    if (students.length === 0) {
      return 'Migration dry run: no active Students on the roster.\n';
    }
    const lines = ['Migration dry run — ' + students.length + ' active Student(s):', ''];
    students.forEach(function (s) {
      lines.push(s.tabName + ' (' + s.studentId + ')');
      lines.push('  Session Pool: ' + formatMoney_(s.sessionPool));
      if (s.uninvoicedCertificates.length === 0) {
        lines.push('  Uninvoiced Certificates: (none)');
      } else {
        lines.push('  Uninvoiced Certificates (' + s.uninvoicedCertificates.length + '):');
        s.uninvoicedCertificates.forEach(function (c) {
          lines.push('    - ' + c.certificateNumber + ' — ' + formatMoney_(c.amount));
        });
      }
      if (s.wouldDraftBatch.length === 0) {
        lines.push('  Would draft: (nothing — pool does not cover the oldest open cert)');
      } else {
        lines.push(
          '  Would draft: ' +
            s.wouldDraftBatch.join(', ') +
            ' — ' +
            formatMoney_(s.wouldInvoiceTotal)
        );
      }
      lines.push('');
    });
    return lines.join('\n');
  },
};

function summariseStudent_(entry) {
  const rows = LedgerGateway.readRows(entry.tabName);

  let poolCents = 0;
  const certificateRows = [];
  const invoicedCertNumbers = {};
  rows.forEach(function (row) {
    const type = String(row.type).trim();
    if (type === 'Session') {
      poolCents += cents_(row.amount);
    } else if (type === 'Certificate') {
      certificateRows.push(row);
    } else if (type === 'Invoice' && row.certificateNumber) {
      invoicedCertNumbers[row.certificateNumber] = true;
    }
  });

  const uninvoiced = certificateRows.filter(function (row) {
    return !invoicedCertNumbers[row.certificateNumber];
  });
  uninvoiced.sort(function (a, b) {
    return (
      CertificateNumber.parse(a.certificateNumber).seq -
      CertificateNumber.parse(b.certificateNumber).seq
    );
  });

  const batch = PoolEngine.coveredBatch(rows);
  const wouldInvoiceCents = batch.reduce(function (sum, row) {
    return sum + Math.abs(cents_(row.amount));
  }, 0);

  return {
    studentId: entry.studentId,
    tabName: entry.tabName,
    sessionPool: poolCents / 100,
    uninvoicedCertificates: uninvoiced.map(function (row) {
      return {
        certificateNumber: row.certificateNumber,
        amount: Math.abs(cents_(row.amount)) / 100,
      };
    }),
    wouldDraftBatch: batch.map(function (row) {
      return row.certificateNumber;
    }),
    wouldInvoiceTotal: wouldInvoiceCents / 100,
  };
}

function cents_(amount) {
  return Math.round((Number(amount) || 0) * 100);
}

function formatMoney_(amount) {
  return '$' + (Number(amount) || 0).toFixed(2);
}

/**
 * Top-level menu-bound entry point: runs the dry-run, logs the formatted
 * report, and (if a UI is attached) shows it in an alert. Returns the report
 * object so it can be inspected from the Apps Script editor too.
 */
function migrationDryRun() {
  const report = Migration.run();
  const text = Migration.formatReport(report);
  Logger.log(text);
  if (typeof SpreadsheetApp !== 'undefined') {
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert('Migration dry run', text, ui.ButtonSet.OK);
    } catch (_) {
      // No UI attached (trigger / editor run) — Logger.log is the only output.
    }
  }
  return report;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Migration: Migration, migrationDryRun: migrationDryRun };
}
