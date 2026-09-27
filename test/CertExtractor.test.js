/**
 * CertExtractor — Slice 11 (#24): read the certificate straight from the PDF
 * text, no AI or OCR.
 *
 * The fixtures in test/fixtures/ are real MVA certificates scrubbed by
 * scripts/scrub-cert-pdf.js (fake student, IDs and specialist; same PDF
 * structure, logo image included). Failure cases use tiny synthetic PDFs
 * built here with Node's zlib.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

global.ZlibInflate = require('../src/ZlibInflate.js');
global.PdfText = require('../src/PdfText.js');
const CertExtractor = require('../src/CertExtractor.js');

const FIXTURES = path.join(__dirname, 'fixtures');

function fixtureBlob(name) {
  const bytes = fs.readFileSync(path.join(FIXTURES, name));
  return {
    getName: () => name,
    // Apps Script hands back signed bytes (-128..127).
    getBytes: () => Array.from(bytes, (b) => (b > 127 ? b - 256 : b)),
  };
}

function textBlock(x, y, text) {
  return 'BT\n1 0 0 1 ' + x + ' ' + y + ' Tm\n/F2 12 Tf\n(' + text.replace(/[()\\]/g, '\\$&') + ')Tj\nET\n';
}

const LABELS = {
  certificateNumber: ['CERTIFICATE NUMBER:', 22, 456, 312, 'MVA-128651-C006'],
  amountPerUnit: ['AMOUNT PER UNIT:', 613, 456, 780, '$25.00'],
  studentName: ['STUDENT NAME:', 22, 440, 312, 'Test Student'],
  materialsFee: ['MATERIALS FEE:', 613, 440, 780, '$0.00'],
  totalAmount: ['TOTAL AMOUNT:', 613, 424, 780, '$1,025.50'],
  classActivity: ['CLASS/ACTIVITY:', 22, 392, 312, 'Group Tutoring - Monthly'],
  serviceDates: ['SERVICE DATE(S):', 22, 332, 312, 'Sep 2026'],
  dateIssued: ['DATE ISSUED:', 57, 66.5, 233, '9/22/2026'],
};

/** Content stream for a certificate-shaped page; `overrides[field]` replaces a value, `null` drops the label. */
function certContent(overrides) {
  let content = '0 1 -1 0 612 0 cm\n';
  Object.keys(LABELS).forEach((field) => {
    const [label, lx, y, vx, value] = LABELS[field];
    const v = overrides && field in overrides ? overrides[field] : value;
    if (v === null) return;
    content += textBlock(lx, y, label);
    if (v !== '') content += textBlock(vx, y, v);
  });
  return content;
}

/** A minimal one-page PDF whose page content is `content`, Flate-compressed. */
function buildPdf(content) {
  const stream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const parts = [
    Buffer.from('%PDF-1.4\n1 0 obj\n<</Length ' + stream.length + '/Filter/FlateDecode>>stream\n', 'latin1'),
    stream,
    Buffer.from(
      '\nendstream\nendobj\n' +
        '2 0 obj\n<</Type/Page/MediaBox[0 0 612 1008]/Contents 1 0 R/Parent 3 0 R>>\nendobj\n' +
        '3 0 obj\n<</Type/Pages/Count 1/Kids[2 0 R]>>\nendobj\n' +
        '4 0 obj\n<</Type/Catalog/Pages 3 0 R>>\nendobj\n' +
        'trailer\n<</Size 5/Root 4 0 R>>\n%%EOF\n',
      'latin1'
    ),
  ];
  return Buffer.concat(parts);
}

function syntheticBlob(overrides) {
  const bytes = buildPdf(certContent(overrides));
  return { getName: () => 'synthetic.pdf', getBytes: () => Array.from(bytes) };
}

test('reads the Group Tutoring - Monthly fixture to exactly its field values', () => {
  assert.deepEqual(CertExtractor.extract(fixtureBlob('cert-group-monthly.pdf')), {
    certificateNumber: 'MVA-100001-C065',
    studentName: 'Test Student',
    classActivity: 'Group Tutoring - Monthly',
    serviceDates: 'Sep 2026',
    dateIssued: '9/22/2026',
    totalAmount: 375,
    amountPerUnit: 375,
    materialsFee: 0,
  });
});

test('reads the Individual Tutoring fixture (logo image, rows shifted up) to exactly its field values', () => {
  assert.deepEqual(CertExtractor.extract(fixtureBlob('cert-individual-math-logo.pdf')), {
    certificateNumber: 'MVA-100002-C028',
    studentName: 'Test Student',
    classActivity: 'Individual Tutoring - Math',
    serviceDates: 'Aug 28, 2026',
    dateIssued: '8/26/2026',
    totalAmount: 50,
    amountPerUnit: 50,
    materialsFee: 0,
  });
});

test('inflates only the page content stream, never the logo image', () => {
  const realInflate = global.ZlibInflate.inflate;
  const inflatedSizes = [];
  global.ZlibInflate = {
    inflate(bytes) {
      const out = realInflate(bytes);
      inflatedSizes.push(out.length);
      return out;
    },
  };
  try {
    CertExtractor.extract(fixtureBlob('cert-individual-math-logo.pdf'));
  } finally {
    global.ZlibInflate = require('../src/ZlibInflate.js');
  }

  assert.equal(inflatedSizes.length, 1, 'one content stream, the image skipped');
  assert.ok(inflatedSizes[0] < 100000, 'the inflated stream is page text, not the ~16 MB logo');
});

test('reads a synthetic certificate, parsing money with thousands separators', () => {
  const cert = CertExtractor.extract(syntheticBlob());

  assert.equal(cert.totalAmount, 1025.5);
  assert.equal(cert.amountPerUnit, 25);
  assert.equal(cert.materialsFee, 0);
  assert.equal(cert.certificateNumber, 'MVA-128651-C006');
});

test('a missing label fails loudly, naming the label', () => {
  assert.throws(
    () => CertExtractor.extract(syntheticBlob({ totalAmount: null })),
    (e) => {
      assert.equal(e.message, 'CertExtractor: the "TOTAL AMOUNT" label wasn\'t found on the certificate');
      return true;
    }
  );
});

test('every required label is checked', () => {
  Object.keys(LABELS).forEach((field) => {
    const label = LABELS[field][0].replace(/:$/, '');
    assert.throws(
      () => CertExtractor.extract(syntheticBlob({ [field]: null })),
      new RegExp('"' + label.replace(/[()/]/g, '\\$&') + '" label wasn\'t found'),
      field
    );
  });
});

test('a label with nothing printed to its right fails loudly instead of reading the next label', () => {
  // CERTIFICATE NUMBER's nearest right-hand neighbour would be "AMOUNT PER UNIT:".
  assert.throws(
    () => CertExtractor.extract(syntheticBlob({ certificateNumber: '' })),
    /"CERTIFICATE NUMBER" label has no value next to it/
  );
});

test('a money field that is not a dollar amount fails loudly, quoting what was there', () => {
  assert.throws(
    () => CertExtractor.extract(syntheticBlob({ totalAmount: 'TBD' })),
    /the "TOTAL AMOUNT" value "TBD" isn't a dollar amount/
  );
});

test('a label printed twice fails loudly rather than picking one', () => {
  const content = certContent() + textBlock(613, 200, 'TOTAL AMOUNT:') + textBlock(780, 200, '$9.00');
  const bytes = buildPdf(content);

  assert.throws(
    () => CertExtractor.extract({ getName: () => 'x.pdf', getBytes: () => Array.from(bytes) }),
    /"TOTAL AMOUNT" label appears more than once/
  );
});

test('a file that is not a readable PDF fails loudly', () => {
  const blob = { getName: () => 'x.pdf', getBytes: () => Array.from(Buffer.from('hello, not a pdf')) };

  assert.throws(() => CertExtractor.extract(blob), /^Error: CertExtractor: couldn't read the PDF's text \(no page content found/);
});
