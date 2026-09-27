/**
 * scripts/scrub-cert-pdf.js — keeps the fixture-making script working, so the
 * next real certificate can become a fixture the same way (Slice 11, #24).
 * A scrubbed fixture stands in for a real certificate here.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { scrub } = require('../scripts/scrub-cert-pdf.js');
const CertExtractor = require('../src/CertExtractor.js');

test('scrubbing rewrites the identifying values and leaves a readable certificate', () => {
  const original = fs.readFileSync(path.join(__dirname, 'fixtures', 'cert-individual-math-logo.pdf'));

  const scrubbed = scrub(original, 'MVA-100009-C009');
  const cert = CertExtractor.extract({ getBytes: () => scrubbed });

  assert.equal(cert.certificateNumber, 'MVA-100009-C009');
  assert.equal(cert.studentName, 'Test Student');
  assert.equal(cert.totalAmount, 50);
  assert.ok(!scrubbed.toString('latin1').includes('MVA-100002-C028'), 'the old number is gone');
  assert.ok(Math.abs(scrubbed.length - original.length) < 100, 'the logo image is kept');
});

test('scrubbing refuses a fake number that is not a Certificate Number', () => {
  const original = fs.readFileSync(path.join(__dirname, 'fixtures', 'cert-group-monthly.pdf'));

  assert.throws(() => scrub(original, 'Phoebe'), /must look like MVA-/);
});
