/**
 * CertificateNumber (pure) — Slice 2 (#3).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const CertificateNumber = require('../src/CertificateNumber.js');

test('parses a well-formed certificate number into studentId and seq', () => {
  assert.deepEqual(CertificateNumber.parse('MVA-128651-C006'), {
    studentId: '128651',
    seq: 6,
  });
});

test('studentId stays a string (preserves any leading zeros); seq is a number', () => {
  const { studentId, seq } = CertificateNumber.parse('MVA-56239-C062');
  assert.equal(studentId, '56239');
  assert.equal(typeof studentId, 'string');
  assert.equal(seq, 62);
  assert.equal(typeof seq, 'number');
});

test('seq drops leading zeros so it sorts numerically (FIFO receipt order)', () => {
  assert.equal(CertificateNumber.parse('MVA-128651-C006').seq, 6);
  assert.equal(CertificateNumber.parse('MVA-128651-C010').seq, 10);
  assert.ok(
    CertificateNumber.parse('MVA-128651-C006').seq <
      CertificateNumber.parse('MVA-128651-C010').seq
  );
});

test('tolerates surrounding whitespace', () => {
  assert.deepEqual(CertificateNumber.parse('  MVA-128651-C006\n'), {
    studentId: '128651',
    seq: 6,
  });
});

test('throws on malformed certificate numbers', () => {
  const bad = [
    '',
    'MVA-128651',
    '128651-C006',
    'MVA-128651-006',
    'MVA-12A651-C006',
    'mva-128651-c006',
    'MVA-128651-C006-extra',
    'XYZ-128651-C006',
  ];
  for (const value of bad) {
    assert.throws(() => CertificateNumber.parse(value), /not a well-formed/, value);
  }
});
