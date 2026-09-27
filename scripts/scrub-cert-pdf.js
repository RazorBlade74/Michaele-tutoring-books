#!/usr/bin/env node
/**
 * Turn a real MVA Enrichment Certificate PDF into a test fixture with no
 * personal data in it (Slice 11, #24).
 *
 *   node scripts/scrub-cert-pdf.js <real-cert.pdf> <test/fixtures/out.pdf> <fake-cert-number>
 *
 *   e.g. node scripts/scrub-cert-pdf.js ~/Downloads/MVA-56239-C065.pdf \
 *          test/fixtures/cert-group-monthly.pdf MVA-100001-C065
 *
 * Real certificates carry a child's name and must never be committed (they're
 * gitignored). This rewrites only the page's text: the student name becomes
 * "Test Student", the Certificate Number (and so the Student ID) and Order
 * Number become fake ones, and the enrichment specialist's name and email
 * become placeholders. Everything else is kept byte for byte, logo image
 * included, so the fixture exercises the same PDF structure as the real one.
 * The script refuses to write the file if any original value is still
 * findable in it.
 */
const fs = require('node:fs');
const zlib = require('node:zlib');

global.ZlibInflate = require('../src/ZlibInflate.js');
global.PdfText = require('../src/PdfText.js');
const CertExtractor = require('../src/CertExtractor.js');

/**
 * @param {Buffer} pdf the real certificate
 * @param {string} fakeCertNumber e.g. `MVA-100001-C065`
 * @returns {Buffer} the scrubbed PDF
 */
function scrub(pdf, fakeCertNumber) {
  const fakeStudentId = /^MVA-(\d+)-C\d+$/.exec(fakeCertNumber);
  if (!fakeStudentId) throw new Error('fake Certificate Number must look like MVA-100001-C001');

  const runs = PdfText.textRuns(pdf);
  const replacements = [
    ['CERTIFICATE NUMBER', fakeCertNumber],
    ['STUDENT NAME', 'Test Student'],
    ['ORDER NUMBER', '2026-MVA-H' + fakeStudentId[1].padStart(7, '0')],
    ['ENRICHMENT SPECIALIST', 'Test Specialist'],
    ['EMAIL', 'test.specialist@example.org'],
  ].map(function (pair) {
    return { from: CertExtractor.valueRightOf(runs, pair[0]), to: pair[1] };
  });

  const text = pdf.toString('latin1');
  const contentsRef = /\/Contents\s+(\d+)\s+0\s+R/.exec(text);
  if (!contentsRef) throw new Error('expected a page with a single /Contents stream');
  const objAt = new RegExp('(^|\\s)' + contentsRef[1] + '\\s+0\\s+obj\\b').exec(text);
  const objStart = objAt.index + objAt[1].length;
  const lengthMatch = /\/Length\s+(\d+)/.exec(text.slice(objStart));
  const lengthStart = objStart + lengthMatch.index + '/Length '.length;
  const lengthEnd = objStart + lengthMatch.index + lengthMatch[0].length;
  const streamKeyword = /stream\r?\n/.exec(text.slice(lengthEnd));
  const dataStart = lengthEnd + streamKeyword.index + streamKeyword[0].length;
  const dataEnd = dataStart + Number(lengthMatch[1]);

  let content = zlib.inflateSync(pdf.subarray(dataStart, dataEnd)).toString('latin1');
  replacements.forEach(function (r) {
    const literal = '(' + pdfEscape(r.from) + ')';
    if (!content.includes(literal)) throw new Error('could not find ' + literal + ' in the page content');
    content = content.split(literal).join('(' + pdfEscape(r.to) + ')');
  });
  const data = zlib.deflateSync(Buffer.from(content, 'latin1'));

  const newLength = Buffer.from(String(data.length), 'latin1');
  const out = Buffer.concat([
    pdf.subarray(0, lengthStart),
    newLength,
    pdf.subarray(lengthEnd, dataStart),
    data,
    pdf.subarray(dataEnd),
  ]);
  const delta = newLength.length - (lengthEnd - lengthStart) + data.length - (dataEnd - dataStart);

  const scrubbed = Buffer.from(shiftXref(out.toString('latin1'), objStart, delta), 'latin1');
  assertScrubbed(scrubbed, content, replacements);
  return scrubbed;
}

function pdfEscape(value) {
  return value.replace(/[()\\]/g, '\\$&');
}

/** Move every xref offset past `after` (and `startxref`) by `delta` bytes. */
function shiftXref(text, after, delta) {
  const xrefAt = text.lastIndexOf('\nxref');
  const head = text.slice(0, xrefAt);
  const tail = text
    .slice(xrefAt)
    .replace(/^(\d{10}) (\d{5}) n/gm, function (entry, offset, gen) {
      const n = Number(offset);
      return String(n > after ? n + delta : n).padStart(10, '0') + ' ' + gen + ' n';
    })
    .replace(/startxref\s+(\d+)/, function (m, offset) {
      return 'startxref\n' + (Number(offset) + delta);
    });
  return head + tail;
}

function assertScrubbed(scrubbed, content, replacements) {
  const raw = scrubbed.toString('latin1');
  replacements.forEach(function (r) {
    // Each name part too, but only the local part of an email: the school's
    // domain is printed all over the template.
    const pieces = [r.from].concat(
      r.from
        .split('@')[0]
        .split(/[\s.]+/)
        .filter(function (word) {
          return word.length >= 3 && !r.to.includes(word);
        })
    );
    if (r.to.includes(r.from)) pieces.shift();
    pieces.forEach(function (piece) {
      if (content.includes(piece) || raw.includes(piece)) {
        throw new Error('scrubbing left "' + piece + '" in the output; not writing it');
      }
    });
  });
  CertExtractor.extract({ getBytes: () => scrubbed }); // still a readable certificate
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('usage: node scripts/scrub-cert-pdf.js <real-cert.pdf> <out.pdf> <fake-cert-number>');
    process.exit(2);
  }
  fs.writeFileSync(args[1], scrub(fs.readFileSync(args[0]), args[2]));
  console.log('wrote ' + args[1]);
}

module.exports = { scrub: scrub };
