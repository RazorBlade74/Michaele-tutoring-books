/**
 * Scaffold smoke test (Slice 1, #2).
 *
 * Proves the test runner works and that the dual-environment module pattern
 * (`if (typeof module !== 'undefined') module.exports = ...`) lets Node require
 * the pure modules. Real per-module tests arrive with the slice that builds
 * each module.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const CertificateNumber = require('../src/CertificateNumber.js');
const CertificateParser = require('../src/CertificateParser.js');
const PoolEngine = require('../src/PoolEngine.js');
const InvoiceNumberAllocator = require('../src/InvoiceNumberAllocator.js');
const DigestBuilder = require('../src/DigestBuilder.js');

test('pure modules are requirable and expose their public interface', () => {
  assert.equal(typeof CertificateNumber.parse, 'function');
  assert.equal(typeof CertificateParser.parse, 'function');
  assert.equal(typeof PoolEngine.coveredBatch, 'function');
  assert.equal(typeof InvoiceNumberAllocator.allocate, 'function');
  assert.equal(typeof DigestBuilder.build, 'function');
});

test('unimplemented pure modules throw a slice-tagged error', () => {
  assert.throws(() => CertificateNumber.parse('MVA-128651-C006'), /Slice 2/);
  assert.throws(() => PoolEngine.coveredBatch([]), /Slice 4/);
  assert.throws(() => DigestBuilder.build({}), /Slice 5/);
});
