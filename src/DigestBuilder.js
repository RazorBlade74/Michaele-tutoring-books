/**
 * DigestBuilder (pure) — turns a combined run result into one digest email.
 *
 * Three sections, in order: certificates entered, certificates flagged,
 * invoices drafted. Any section whose list is empty is omitted. When every
 * section is empty (nothing happened), `build` returns `null` so the
 * Orchestrator can skip the send. Built in Slice 5 (#6).
 */
const DigestBuilder = {
  /**
   * @param {{
   *   certificatesEntered: Array<{ certificateNumber: string, tabName: string }>,
   *   certificatesFlagged: Array<{
   *     reason: string,
   *     certificateNumber: (string|null),
   *     studentId: (string|null),
   *     attachmentName: string
   *   }>,
   *   invoicesDrafted: Array<{
   *     tabName: string,
   *     invoiceNumber: string,
   *     certificateNumbers: Array<string>,
   *     total: number
   *   }>
   * }} runResult
   * @returns {{ subject: string, body: string } | null} null when nothing happened
   */
  build(runResult) {
    const entered = runResult.certificatesEntered || [];
    const flagged = runResult.certificatesFlagged || [];
    const drafted = runResult.invoicesDrafted || [];

    if (entered.length === 0 && flagged.length === 0 && drafted.length === 0) {
      return null;
    }

    const sections = [];
    if (entered.length > 0) {
      sections.push(
        'Certificates entered (' + entered.length + '):\n' +
          entered
            .map(function (row) {
              return '  - ' + row.certificateNumber + ' → ' + row.tabName;
            })
            .join('\n')
      );
    }
    if (flagged.length > 0) {
      sections.push(
        'Certificates flagged (' + flagged.length + '):\n' +
          flagged
            .map(function (row) {
              const id = row.certificateNumber || row.studentId || '(unknown)';
              return '  - ' + row.reason + ': ' + id + ' (' + row.attachmentName + ')';
            })
            .join('\n')
      );
    }
    if (drafted.length > 0) {
      sections.push(
        'Invoices drafted (' + drafted.length + '):\n' +
          drafted
            .map(function (row) {
              return (
                '  - ' +
                row.invoiceNumber +
                ' — ' +
                row.tabName +
                ' — ' +
                formatMoney_(row.total) +
                ' — ' +
                row.certificateNumbers.join(', ')
              );
            })
            .join('\n')
      );
    }

    const subject =
      'Lamp Post Tutoring digest: ' +
      entered.length +
      ' entered, ' +
      flagged.length +
      ' flagged, ' +
      drafted.length +
      ' drafted';

    return { subject: subject, body: sections.join('\n\n') + '\n' };
  },
};

function formatMoney_(amount) {
  const value = Number(amount) || 0;
  return '$' + value.toFixed(2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DigestBuilder;
}
