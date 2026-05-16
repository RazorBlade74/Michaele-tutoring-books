/**
 * PoolCheck — wires the daily invoice-drafting path: for each active Student,
 * read the ledger -> compute the Covered Batch -> hand it to InvoiceWriter to
 * allocate / draft / write. Strict-FIFO governs this path (see PoolEngine).
 *
 * State is recomputed from the ledger every run: an existing `Invoice` row
 * means its Certificate is invoiced and is excluded from the draw-down (see
 * `docs/adr/0002-invoice-ledger-rows-one-per-certificate.md`). The invoice
 * counter is persisted once, at the end, after every draft is allocated.
 * Built in Slice 4 (#5); kernel extracted into InvoiceWriter in Slice 9 (#20)
 * so the EarlyInvoice menu can reuse it.
 */

/**
 * Draft an invoice for every active Student whose Session Pool covers a batch.
 *
 * @param {Date} [runDate] the date of the run — the invoice date and the year
 *   the invoice number is allocated against. Defaults to now.
 * @returns {{
 *   drafted: Array<{
 *     tabName: string,
 *     invoiceNumber: string,
 *     certificateNumbers: Array<string>,
 *     total: number
 *   }>
 * }} what was drafted this run
 */
function runPoolCheck(runDate) {
  const now = runDate || new Date();
  const settings = ConfigGateway.getInvoiceSettings();

  let counterState = ConfigGateway.getInvoiceCounter();
  const result = { drafted: [] };

  ConfigGateway.getRoster().forEach(function (entry) {
    if (!entry.active) return;

    const coveredBatch = PoolEngine.coveredBatch(LedgerGateway.readRows(entry.tabName));
    if (coveredBatch.length === 0) return;

    const writeResult = InvoiceWriter.draft({
      certRows: coveredBatch,
      rosterEntry: entry,
      settings: settings,
      counterState: counterState,
      runDate: now,
    });
    counterState = writeResult.newCounterState;

    result.drafted.push({
      tabName: entry.tabName,
      invoiceNumber: writeResult.invoiceNumber,
      certificateNumbers: coveredBatch.map(function (row) {
        return row.certificateNumber;
      }),
      total: writeResult.total,
    });
  });

  // Persist the advanced counter only when a number was actually issued, so a
  // no-op run leaves the Config cell untouched.
  if (result.drafted.length > 0) {
    ConfigGateway.setInvoiceCounter(counterState);
  }

  return result;
}

// In Apps Script every .gs file shares one global scope, so the Orchestrator
// references this module as `PoolCheck.runPoolCheck()`. Wrap the top-level
// function in a `PoolCheck` object to match the convention every other module
// uses.
const PoolCheck = { runPoolCheck: runPoolCheck };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PoolCheck: PoolCheck, runPoolCheck: runPoolCheck };
}
