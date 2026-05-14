/**
 * InvoiceDocBuilder — maps a Covered Batch + config to template field values
 * (pure mapping) and fills the Doc template, exporting a PDF into the Drive
 * `Invoices` folder (I/O).
 *
 * Built in Slice 4 (#5).
 */
const InvoiceDocBuilder = {
  /**
   * Pure mapping: Covered Batch + config -> template field values.
   * @param {Array<object>} coveredBatch
   * @param {object} config invoice settings + allocated invoice number
   * @returns {object} template field values (header block, address block,
   *   one line item per Certificate, total)
   */
  toTemplateValues(coveredBatch, config) {
    throw new Error('InvoiceDocBuilder.toTemplateValues not implemented — Slice 4 (#5)');
  },

  /**
   * I/O: fill the Doc template and export a PDF into the `Invoices` folder.
   * @param {object} templateValues
   * @returns {object} the exported PDF blob
   */
  buildPdf(templateValues) {
    throw new Error('InvoiceDocBuilder.buildPdf not implemented — Slice 4 (#5)');
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceDocBuilder;
}
