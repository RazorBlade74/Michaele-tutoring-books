/**
 * ZlibInflate — Slice 11 (#24). The vendored pure-JS inflater, checked
 * against Node's own `zlib` output: every level, a stored (uncompressed)
 * block, output many times larger than the input, and corrupt input.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const ZlibInflate = require('../src/ZlibInflate.js');

function pseudoRandomBytes(length, seed) {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x >> 16;
  }
  return out;
}

function contentStreamLike(repeats) {
  let text = '';
  for (let i = 0; i < repeats; i++) {
    text += 'BT\n1 0 0 1 22 ' + (456 - i) + ' Tm\n/F1 12 Tf\n(CERTIFICATE NUMBER:)Tj\nET\n';
  }
  return Buffer.from(text, 'latin1');
}

test('inflates zlib output at every compression level back to the original bytes', () => {
  const original = contentStreamLike(200);
  for (let level = 0; level <= 9; level++) {
    const inflated = ZlibInflate.inflate(zlib.deflateSync(original, { level: level }));

    assert.deepEqual(Buffer.from(inflated), original, 'level ' + level);
  }
});

test('inflates incompressible data (stored and dynamic blocks mixed)', () => {
  const original = Buffer.from(pseudoRandomBytes(100000, 7));

  const inflated = ZlibInflate.inflate(zlib.deflateSync(original));

  assert.deepEqual(Buffer.from(inflated), original);
});

test('grows its output buffer when the data expands far beyond the input', () => {
  const original = Buffer.alloc(3 * 1024 * 1024, 0x41);
  const compressed = zlib.deflateSync(original, { level: 9 });
  assert.ok(compressed.length * 100 < original.length, 'fixture should expand a lot');

  const inflated = ZlibInflate.inflate(compressed);

  assert.equal(inflated.length, original.length);
  assert.deepEqual(Buffer.from(inflated), original);
});

test('inflates empty input to empty output', () => {
  assert.equal(ZlibInflate.inflate(zlib.deflateSync(Buffer.alloc(0))).length, 0);
});

test('accepts Apps Script-style signed bytes (-128..127)', () => {
  const original = contentStreamLike(20);
  const signed = Array.from(zlib.deflateSync(original), (b) => (b > 127 ? b - 256 : b));

  assert.deepEqual(Buffer.from(ZlibInflate.inflate(signed)), original);
});

test('throws on data that is not a zlib stream', () => {
  assert.throws(() => ZlibInflate.inflate(Buffer.from('not compressed at all')), /ZlibInflate/);
});

test('throws, rather than hanging, on a truncated stream', () => {
  const compressed = zlib.deflateSync(Buffer.from(pseudoRandomBytes(50000, 3)));

  assert.throws(() => ZlibInflate.inflate(compressed.subarray(0, compressed.length / 2)), /ZlibInflate/);
});
