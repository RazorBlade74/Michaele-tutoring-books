/**
 * PoolCheck — wires the invoice-drafting path: for each active Student, read
 * the ledger -> compute the Covered Batch -> allocate an invoice number ->
 * build the PDF -> create a Gmail draft -> write one `Invoice` row per
 * Certificate, with `Status = Draft`.
 *
 * State is recomputed from the ledger every run: an existing `Invoice` row
 * means its Certificate is invoiced and is excluded from the draw-down (see
 * `docs/adr/0002-invoice-ledger-rows-one-per-certificate.md`). The invoice
 * counter is persisted once, at the end, after every draft is allocated. The
 * Orchestrator that schedules this run — and the digest that consumes the
 * result — is Slice 5 (#6). Built in Slice 4 (#5).
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

    const allocation = InvoiceNumberAllocator.allocate(counterState, now.getFullYear());
    counterState = allocation.state;

    const templateValues = InvoiceDocBuilder.toTemplateValues(coveredBatch, {
      invoiceNumber: allocation.invoiceNumber,
      invoiceDate: now,
      business: settings.business,
      billTo: settings.billTo,
      studentName: entry.certName,
      defaultDescription: settings.defaultDescription,
    });
    const pdfBlob = InvoiceDocBuilder.buildPdf(templateValues);

    InvoiceMailer.draftInvoice({
      to: settings.invoicingEmail,
      subject: 'Invoice ' + allocation.invoiceNumber,
      body:
        'Please find attached invoice ' +
        allocation.invoiceNumber +
        ' from ' +
        settings.business.name +
        '.',
      pdfBlob: pdfBlob,
    });

    coveredBatch.forEach(function (certificateRow) {
      LedgerGateway.appendRow(entry.tabName, {
        date: now,
        type: 'Invoice',
        description: allocation.invoiceNumber,
        amount: Math.abs(Number(certificateRow.amount) || 0),
        certificateNumber: certificateRow.certificateNumber,
        status: 'Draft',
      });
    });

    result.drafted.push({
      tabName: entry.tabName,
      invoiceNumber: allocation.invoiceNumber,
      certificateNumbers: coveredBatch.map(function (row) {
        return row.certificateNumber;
      }),
      total: templateValues.total,
    });
  });

  // Persist the advanced counter only when a number was actually issued, so a
  // no-op run leaves the Config cell untouched.
  if (result.drafted.length > 0) {
    ConfigGateway.setInvoiceCounter(counterState);
  }

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runPoolCheck };
}
