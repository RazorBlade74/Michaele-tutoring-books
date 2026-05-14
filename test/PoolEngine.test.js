/**
 * PoolEngine.coveredBatch — Slice 4 (#5) core domain logic.
 *
 * Pure module. Its only collaborator is the pure `CertificateNumber` parser,
 * which Apps Script sees as a file-scope global; the test supplies the real one
 * as a Node global. Ledger rows are built by the helpers below so each test
 * states the Student's ledger directly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.CertificateNumber = require('../src/CertificateNumber.js');
const PoolEngine = require('../src/PoolEngine.js');

function session(amount) {
  return { type: 'Session', amount: amount, certificateNumber: '', status: '' };
}
function certificate(certificateNumber, amount) {
  return {
    type: 'Certificate',
    amount: -Math.abs(amount), // Certificate rows carry the approved amount as a negative
    certificateNumber: certificateNumber,
    status: '',
  };
}
function invoice(certificateNumber) {
  return {
    type: 'Invoice',
    amount: Math.abs(0),
    certificateNumber: certificateNumber,
    status: 'Draft',
  };
}
function numbers(batch) {
  return batch.map(function (row) {
    return row.certificateNumber;
  });
}

test('no sessions: nothing is covered', () => {
  const batch = PoolEngine.coveredBatch([certificate('MVA-128651-C006', 25)]);

  assert.deepEqual(numbers(batch), []);
});

test('a pool smaller than the oldest certificate covers nothing', () => {
  const batch = PoolEngine.coveredBatch([
    session(10),
    certificate('MVA-128651-C006', 25),
  ]);

  assert.deepEqual(numbers(batch), []);
});

test('a pool exactly equal to the oldest certificate covers it', () => {
  const batch = PoolEngine.coveredBatch([
    session(25),
    certificate('MVA-128651-C006', 25),
  ]);

  assert.deepEqual(numbers(batch), ['MVA-128651-C006']);
});

test('a pool covering several certificates returns them all as one batch', () => {
  const batch = PoolEngine.coveredBatch([
    session(60),
    session(40),
    certificate('MVA-128651-C006', 25),
    certificate('MVA-128651-C007', 25),
    certificate('MVA-128651-C008', 50),
  ]);

  assert.deepEqual(numbers(batch), [
    'MVA-128651-C006',
    'MVA-128651-C007',
    'MVA-128651-C008',
  ]);
});

test('surplus pool beyond the last certificate is simply left in the pool', () => {
  const batch = PoolEngine.coveredBatch([
    session(500),
    certificate('MVA-128651-C006', 25),
  ]);

  assert.deepEqual(numbers(batch), ['MVA-128651-C006']);
});

test('already-invoiced certificates are excluded, and their cost is removed from the pool', () => {
  const batch = PoolEngine.coveredBatch([
    session(100),
    certificate('MVA-128651-C006', 25),
    invoice('MVA-128651-C006'),
    certificate('MVA-128651-C007', 25),
  ]);

  // C006 is invoiced: it consumes 25 of the 100 pool, leaving 75 to cover C007.
  assert.deepEqual(numbers(batch), ['MVA-128651-C007']);
});

test('an invoiced certificate consumes pool, so a later one may no longer be covered', () => {
  const batch = PoolEngine.coveredBatch([
    session(40),
    certificate('MVA-128651-C006', 25),
    invoice('MVA-128651-C006'),
    certificate('MVA-128651-C007', 25),
  ]);

  // 40 pool - 25 consumed by the invoiced C006 = 15, which cannot cover C007.
  assert.deepEqual(numbers(batch), []);
});

test('strict FIFO: a covered later certificate is not pulled ahead of an uncovered earlier one', () => {
  const batch = PoolEngine.coveredBatch([
    session(30),
    certificate('MVA-128651-C006', 100), // too big for the 30 pool
    certificate('MVA-128651-C007', 20), // would fit on its own, but must not skip ahead
  ]);

  assert.deepEqual(numbers(batch), []);
});

test('certificates are drawn in seq order regardless of physical row order', () => {
  const batch = PoolEngine.coveredBatch([
    session(50),
    certificate('MVA-128651-C008', 25),
    certificate('MVA-128651-C006', 25),
  ]);

  assert.deepEqual(numbers(batch), ['MVA-128651-C006', 'MVA-128651-C008']);
});

test('the batch contains the Certificate ledger rows themselves', () => {
  const c6 = certificate('MVA-128651-C006', 25);

  const batch = PoolEngine.coveredBatch([session(25), c6]);

  assert.equal(batch[0], c6);
});

test('coverage is compared exactly to the cent', () => {
  const batch = PoolEngine.coveredBatch([
    session(25.1),
    session(25.1),
    session(24.8),
    certificate('MVA-128651-C006', 75),
  ]);

  // 25.1 + 25.1 + 24.8 is 75.00000000000001 in float math; cent-exact it is 75.
  assert.deepEqual(numbers(batch), ['MVA-128651-C006']);
});
