/**
 * InvoiceNumberAllocator.allocate — Slice 4 (#5).
 *
 * Pure module, no collaborators. `state.counter` is the *next* sequence number
 * to issue (the Config tab stores the next number, not the last one).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const InvoiceNumberAllocator = require('../src/InvoiceNumberAllocator.js');

test('allocates the next number and advances the counter', () => {
  const result = InvoiceNumberAllocator.allocate({ year: 2026, counter: 1 }, 2026);

  assert.equal(result.invoiceNumber, '2026-001');
  assert.deepEqual(result.state, { year: 2026, counter: 2 });
});

test('allocates sequentially across calls', () => {
  const first = InvoiceNumberAllocator.allocate({ year: 2026, counter: 1 }, 2026);
  const second = InvoiceNumberAllocator.allocate(first.state, 2026);
  const third = InvoiceNumberAllocator.allocate(second.state, 2026);

  assert.deepEqual(
    [first.invoiceNumber, second.invoiceNumber, third.invoiceNumber],
    ['2026-001', '2026-002', '2026-003']
  );
  assert.deepEqual(third.state, { year: 2026, counter: 4 });
});

test('resets to 001 when the year rolls over', () => {
  const result = InvoiceNumberAllocator.allocate({ year: 2025, counter: 47 }, 2026);

  assert.equal(result.invoiceNumber, '2026-001');
  assert.deepEqual(result.state, { year: 2026, counter: 2 });
});

test('pads the sequence to three digits', () => {
  assert.equal(
    InvoiceNumberAllocator.allocate({ year: 2026, counter: 7 }, 2026).invoiceNumber,
    '2026-007'
  );
  assert.equal(
    InvoiceNumberAllocator.allocate({ year: 2026, counter: 42 }, 2026).invoiceNumber,
    '2026-042'
  );
});

test('does not truncate a sequence that has grown past three digits', () => {
  const result = InvoiceNumberAllocator.allocate({ year: 2026, counter: 1000 }, 2026);

  assert.equal(result.invoiceNumber, '2026-1000');
});
