/**
 * InvoiceWriter — the shared invoice-drafting kernel.
 *
 * Encapsulates the five-step sequence shared by every invoice-drafting path:
 * allocate the next invoice number, fill the Doc template + export a PDF,
 * create a Gmail draft, and write one `Invoice` ledger row per Certificate
 * (`Status = Draft`). Both the daily PoolCheck (strict-FIFO Covered Batch)
 * and the tutor-initiated EarlyInvoice (hand-picked subset, may go negative)
 * call this — the kernel itself does not know or care which.
 *
 * Pure orchestration over the four invoice gateways; the only side effects
 * happen inside those collaborators. Counter state is threaded in and out
 * so the caller decides when to persist (PoolCheck persists once at the end
 * of its loop; EarlyInvoice persists immediately after its single draft).
 * Built in Slice 9 (#20).
 */
const InvoiceWriter = {
  /**
   * Draft a single invoice covering `certRows` for one Student.
   *
   * @param {{
   *   certRows: Array<{ certificateNumber: string, description: *, amount: number }>,
   *   rosterEntry: { tabName: string, certName: string },
   *   settings: {
   *     business: { name: string, subtitle: string, address: string, phone: string },
   *     billTo: { name: string, address: string },
   *     invoicingEmail: string,
   *     defaultDescription: string
   *   },
   *   counterState: { year: number, counter: number },
   *   runDate: Date
   * }} options
   * @returns {{
   *   invoiceNumber: string,
   *   total: number,
   *   newCounterState: { year: number, counter: number }
   * }}
   */
  draft(options) {
    const certRows = options.certRows;
    const rosterEntry = options.rosterEntry;
    const settings = options.settings;
    const runDate = options.runDate;

    const allocation = InvoiceNumberAllocator.allocate(
      options.counterState,
      runDate.getFullYear()
    );

    const templateValues = InvoiceDocBuilder.toTemplateValues(certRows, {
      invoiceNumber: allocation.invoiceNumber,
      invoiceDate: runDate,
      business: settings.business,
      billTo: settings.billTo,
      studentName: rosterEntry.certName,
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

    certRows.forEach(function (certificateRow) {
      LedgerGateway.appendRow(rosterEntry.tabName, {
        date: runDate,
        type: 'Invoice',
        description: allocation.invoiceNumber,
        amount: Math.abs(Number(certificateRow.amount) || 0),
        certificateNumber: certificateRow.certificateNumber,
        status: 'Draft',
      });
    });

    return {
      invoiceNumber: allocation.invoiceNumber,
      total: templateValues.total,
      newCounterState: allocation.state,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceWriter;
}
