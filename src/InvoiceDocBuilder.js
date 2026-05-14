/**
 * InvoiceDocBuilder — maps a Covered Batch + config to template field values
 * (pure mapping) and fills the Doc template, exporting a PDF into the Drive
 * `Invoices` folder (I/O).
 *
 * Built in Slice 4 (#5).
 *
 * Doc-template contract (`buildPdf`): a Google Doc holding the scalar tokens
 * `{{invoiceNumber}}`, `{{invoiceDate}}`, `{{vendorName}}`, `{{vendorAddress}}`,
 * `{{vendorEmail}}`, `{{vendorPhone}}`, `{{billToEmail}}`, `{{total}}`, and one
 * table whose line-item row carries `{{description}}`, `{{date}}`, `{{po}}`,
 * `{{amount}}` — that row is cloned once per line item and then removed.
 */
const SERVICE_PERIOD_SEPARATOR = ' — '; // the em-dash join Intake writes into a cert Description

const InvoiceDocBuilder = {
  /**
   * Pure mapping: Covered Batch + config -> template field values.
   * @param {Array<object>} coveredBatch the Certificate ledger rows to bill
   * @param {{
   *   invoiceNumber: string,
   *   invoiceDate: (Date|string),
   *   vendor: { name: string, address: string, email: string, phone: string },
   *   invoicingEmail: string,
   *   defaultDescription: string
   * }} config invoice settings + the allocated invoice number
   * @returns {{
   *   invoiceNumber: string,
   *   invoiceDate: (Date|string),
   *   vendor: object,
   *   invoicingEmail: string,
   *   lineItems: Array<{ description: string, date: string, po: string, amount: number }>,
   *   total: number
   * }}
   */
  toTemplateValues(coveredBatch, config) {
    const lineItems = coveredBatch.map(function (row) {
      return {
        description: config.defaultDescription,
        date: servicePeriod_(row.description),
        po: row.certificateNumber,
        amount: Math.abs(Number(row.amount) || 0),
      };
    });
    const totalCents = lineItems.reduce(function (sum, item) {
      return sum + Math.round(item.amount * 100);
    }, 0);
    return {
      invoiceNumber: config.invoiceNumber,
      invoiceDate: config.invoiceDate,
      vendor: config.vendor,
      invoicingEmail: config.invoicingEmail,
      lineItems: lineItems,
      total: totalCents / 100,
    };
  },

  /**
   * I/O: fill the Doc template and export a PDF into the `Invoices` folder.
   * @param {object} templateValues output of `toTemplateValues`
   * @param {{ templateDocId: string, invoicesFolderId: string }} config
   * @returns {GoogleAppsScript.Base.Blob} the exported PDF blob
   */
  buildPdf(templateValues, config) {
    const invoicesFolder = DriveApp.getFolderById(config.invoicesFolderId);
    const docName = 'Invoice ' + templateValues.invoiceNumber;
    const docCopy = DriveApp.getFileById(config.templateDocId).makeCopy(
      docName,
      invoicesFolder
    );
    const doc = DocumentApp.openById(docCopy.getId());
    const body = doc.getBody();

    body.replaceText('{{invoiceNumber}}', templateValues.invoiceNumber);
    body.replaceText('{{invoiceDate}}', formatDate_(templateValues.invoiceDate));
    body.replaceText('{{vendorName}}', templateValues.vendor.name);
    body.replaceText('{{vendorAddress}}', templateValues.vendor.address);
    body.replaceText('{{vendorEmail}}', templateValues.vendor.email);
    body.replaceText('{{vendorPhone}}', templateValues.vendor.phone);
    body.replaceText('{{billToEmail}}', templateValues.invoicingEmail);
    body.replaceText('{{total}}', money_(templateValues.total));
    fillLineItemTable_(body, templateValues.lineItems);

    doc.saveAndClose();

    const pdfBlob = DriveApp.getFileById(docCopy.getId())
      .getAs('application/pdf')
      .setName(docName + '.pdf');
    invoicesFolder.createFile(pdfBlob);
    docCopy.setTrashed(true); // keep only the PDF; the filled Doc was a working copy

    return pdfBlob;
  },
};

/** The service-period label — the segment after the em-dash join in a cert Description. */
function servicePeriod_(description) {
  const text = String(description == null ? '' : description);
  const idx = text.lastIndexOf(SERVICE_PERIOD_SEPARATOR);
  return idx === -1 ? '' : text.slice(idx + SERVICE_PERIOD_SEPARATOR.length).trim();
}

/**
 * Clones the template's line-item row once per line item (inserting above it so
 * any total row stays last), fills each clone, then removes the template row.
 */
function fillLineItemTable_(body, lineItems) {
  const tables = body.getTables();
  let table = null;
  let templateRowIndex = -1;
  for (let t = 0; t < tables.length && !table; t++) {
    for (let r = 0; r < tables[t].getNumRows(); r++) {
      if (tables[t].getRow(r).getText().indexOf('{{description}}') !== -1) {
        table = tables[t];
        templateRowIndex = r;
        break;
      }
    }
  }
  if (!table) {
    throw new Error(
      'InvoiceDocBuilder.buildPdf: the template has no line-item row containing {{description}}'
    );
  }
  const templateRow = table.getRow(templateRowIndex);
  lineItems.forEach(function (item, i) {
    const row = table.insertTableRow(templateRowIndex + i, templateRow.copy());
    row.replaceText('{{description}}', item.description);
    row.replaceText('{{date}}', item.date);
    row.replaceText('{{po}}', item.po);
    row.replaceText('{{amount}}', money_(item.amount));
  });
  table.removeRow(templateRowIndex + lineItems.length);
}

/** A Date as `MMM d, yyyy`; a value that is already a string passes through. */
function formatDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'MMM d, yyyy');
  }
  return String(value);
}

/** A dollar amount as `$0.00`. */
function money_(amount) {
  return '$' + (Number(amount) || 0).toFixed(2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InvoiceDocBuilder;
}
