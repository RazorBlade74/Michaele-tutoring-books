/**
 * PdfText (pure) — the positioned text runs on a PDF's pages.
 *
 * Built for MVA Enrichment Certificates (Slice 11, #24; ADR 0004): iText 5
 * PDFs, one page, standard Type1 Helvetica fonts in WinAnsi encoding, all text
 * in one Flate-compressed content stream. It is not a general PDF reader: it
 * finds each page's `/Contents` stream(s), inflates only those, and replays
 * the text operators to record where each string is drawn. Image XObjects and
 * every other stream are left compressed — a certificate's logo inflates to
 * about 16 MB. Anything outside what this template uses (object streams,
 * filters other than FlateDecode) throws rather than guessing.
 *
 * Positions are in text space: the `x`/`y` of the text matrix when the string
 * is shown. Strings shown one after another without repositioning share a
 * position (glyph widths aren't computed), which is enough to line a label
 * up with the value printed to its right.
 */
const PdfText = {
  /**
   * @param {ArrayLike<number>} bytes the PDF file (signed or unsigned bytes)
   * @returns {Array<{ x: number, y: number, text: string }>} text runs in
   *   drawing order, across every page
   * @throws when no page content can be found or decoded
   */
  textRuns(bytes) {
    const pdf = pdfLatin1_(bytes);
    const runs = [];
    pdfPageContents_(pdf).forEach(function (content) {
      pdfReplayText_(content, runs);
    });
    return runs;
  },
};

// Top-level helpers are prefixed `pdf…_`: Apps Script shares one global scope
// across every file.

function pdfLatin1_(bytes) {
  const u8 = Uint8Array.from(bytes, function (b) {
    return b & 0xff;
  });
  let text = '';
  for (let i = 0; i < u8.length; i += 8192) {
    text += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  }
  return text;
}

/**
 * Offset of each `N G obj` header; the last definition wins (incremental
 * updates). Stream bodies with a direct `/Length` are jumped over, so bytes
 * inside compressed data (the logo image) can't pass for an object header.
 */
function pdfObjectOffsets_(pdf) {
  const offsets = {};
  const re = /(?:^|[\r\n\s])(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(pdf))) {
    offsets[m[1]] = m.index + m[0].length;
    const obj = pdfObjectHead_(pdf, offsets, m[1]);
    const length = pdfDirectLength_(obj.head);
    if (obj.streamAt !== -1 && length !== null) {
      re.lastIndex = pdfStreamStart_(pdf, obj) + length;
    }
  }
  return offsets;
}

/** The dictionary's `/Length` when it's a plain number, else null. */
function pdfDirectLength_(dict) {
  const m = /\/Length\s+(\d+)\b(?!\s+\d+\s+R\b)/.exec(dict);
  return m ? Number(m[1]) : null;
}

/** Offset of a stream's first data byte: after `stream` and its end-of-line. */
function pdfStreamStart_(pdf, obj) {
  let at = obj.start + obj.streamAt + 'stream'.length;
  if (pdf[at] === '\r') at++;
  if (pdf[at] === '\n') at++;
  return at;
}

/** The dictionary text of object `num` — from `obj` up to `stream` / `endobj`. */
function pdfObjectHead_(pdf, offsets, num) {
  const start = offsets[num];
  if (start === undefined) throw new Error('PDF object ' + num + ' not found');
  // The dictionary ends at `stream` or `endobj`, whichever comes first; only
  // the text before it is scanned, never the stream body.
  const end = /\bstream\r?\n|\bendobj\b/g;
  end.lastIndex = start;
  const m = end.exec(pdf);
  const stop = m ? m.index : pdf.length;
  const isStream = !!m && m[0].indexOf('stream') === 0;
  return { start: start, head: pdf.slice(start, stop), streamAt: isStream ? stop - start : -1 };
}

function pdfStreamData_(pdf, offsets, num) {
  const obj = pdfObjectHead_(pdf, offsets, num);
  if (obj.streamAt === -1) throw new Error('PDF object ' + num + ' is not a stream');
  const dict = obj.head;
  const dataStart = pdfStreamStart_(pdf, obj);

  let length = pdfDirectLength_(dict);
  const indirect = /\/Length\s+(\d+)\s+\d+\s+R\b/.exec(dict);
  if (length === null && indirect) {
    const value = /^\s*(\d+)/.exec(pdfObjectHead_(pdf, offsets, indirect[1]).head);
    if (!value) throw new Error('PDF object ' + num + ' has an unreadable /Length');
    length = Number(value[1]);
  } else if (length === null) {
    length = pdf.indexOf('endstream', dataStart) - dataStart;
  }
  const raw = pdf.slice(dataStart, dataStart + length);

  const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict);
  if (!filter) return raw;
  const filters = filter[1].match(/\/\w+/g) || [];
  if (filters.length !== 1 || filters[0] !== '/FlateDecode') {
    throw new Error('PDF content stream uses unsupported filter ' + filter[1]);
  }
  const inflated = ZlibInflate.inflate(
    Array.prototype.map.call(raw, function (c) {
      return c.charCodeAt(0);
    })
  );
  return pdfLatin1_(inflated);
}

/** The decoded content stream text of every page, in page-object order. */
function pdfPageContents_(pdf) {
  const offsets = pdfObjectOffsets_(pdf);
  const contents = [];
  Object.keys(offsets).forEach(function (num) {
    const dict = pdfObjectHead_(pdf, offsets, num).head;
    if (!/\/Type\s*\/Page(?![a-zA-Z])/.test(dict)) return;
    const refs = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(dict);
    if (!refs) return;
    const parts = [];
    const refRe = /(\d+)\s+\d+\s+R/g;
    let m;
    while ((m = refRe.exec(refs[1]))) parts.push(pdfStreamData_(pdf, offsets, m[1]));
    // A page's content streams concatenate into one program (PDF 32000 §7.8.2).
    contents.push(parts.join('\n'));
  });
  if (contents.length === 0) throw new Error('no page content found in the PDF');
  return contents;
}

// WinAnsiEncoding bytes 0x80–0x9F that differ from Latin-1 (PDF 32000 Annex D).
const PDF_WIN_ANSI_HIGH = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

function pdfWinAnsi_(byteString) {
  return byteString.replace(/[\x80-\x9f]/g, function (c) {
    return PDF_WIN_ANSI_HIGH[c.charCodeAt(0)] || c;
  });
}

const PDF_ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };

/**
 * Tokenise a content stream into operands and operators. Strings come back as
 * `{ str }`, arrays as JS arrays, numbers as numbers, names as `{ name }`,
 * operators as `{ op }`.
 */
function pdfTokens_(content) {
  const tokens = [];
  const stack = [tokens];
  const n = content.length;
  let i = 0;
  function push(token) {
    stack[stack.length - 1].push(token);
  }
  while (i < n) {
    const c = content[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '%') {
      while (i < n && content[i] !== '\n' && content[i] !== '\r') i++;
    } else if (c === '(') {
      let depth = 1;
      let s = '';
      i++;
      while (i < n && depth > 0) {
        const ch = content[i];
        if (ch === '\\') {
          const next = content[i + 1];
          if (PDF_ESCAPES[next]) {
            s += PDF_ESCAPES[next];
            i += 2;
          } else if (/[0-7]/.test(next)) {
            const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4))[0];
            s += String.fromCharCode(parseInt(octal, 8) & 0xff);
            i += 1 + octal.length;
          } else if (next === '\r' || next === '\n') {
            i += next === '\r' && content[i + 2] === '\n' ? 3 : 2; // line continuation
          } else {
            s += next === undefined ? '' : next;
            i += 2;
          }
        } else {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
          if (depth > 0) s += ch;
          i++;
        }
      }
      push({ str: s });
    } else if (c === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      let hex = content.slice(i + 1, end === -1 ? n : end).replace(/\s+/g, '');
      if (hex.length % 2) hex += '0';
      let s = '';
      for (let k = 0; k < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      push({ str: s });
      i = end === -1 ? n : end + 1;
    } else if (c === '[') {
      const arr = [];
      push(arr);
      stack.push(arr);
      i++;
    } else if (c === ']') {
      if (stack.length > 1) stack.pop();
      i++;
    } else if (c === '<' || c === '>' || c === '{' || c === '}' || c === ')') {
      // Dictionary delimiters only appear around marked-content properties; a
      // stray `)` carries nothing.
      i += content[i + 1] === c ? 2 : 1;
    } else if (c === '/') {
      const m = /^\/[^\s\/\[\]()<>{}%]*/.exec(content.slice(i, i + 128));
      push({ name: m[0].slice(1) });
      i += m[0].length;
    } else {
      const m = /^[^\s\/\[\]()<>{}%]+/.exec(content.slice(i, i + 128));
      const word = m ? m[0] : content[i];
      i += word.length;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
        push(Number(word));
      } else if (word === 'ID') {
        // Inline image data is binary; skip to its `EI`.
        const ei = content.slice(i).search(/\sEI(?=\s|$)/);
        i = ei === -1 ? n : i + ei + 3;
      } else {
        push({ op: word });
      }
    }
  }
  return tokens;
}

/** Replay the text operators of one content stream, appending runs to `runs`. */
function pdfReplayText_(content, runs) {
  let tm = [1, 0, 0, 1, 0, 0]; // text matrix
  let tlm = tm; // text line matrix
  let leading = 0;
  let operands = [];

  function moveLine(tx, ty) {
    tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tx * tlm[0] + ty * tlm[2] + tlm[4], tx * tlm[1] + ty * tlm[3] + tlm[5]];
    tm = tlm;
  }
  function show(str) {
    runs.push({ x: round2(tm[4]), y: round2(tm[5]), text: pdfWinAnsi_(str) });
  }
  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  pdfTokens_(content).forEach(function (token) {
    if (!token || token.op === undefined) {
      operands.push(token);
      return;
    }
    const args = operands;
    operands = [];
    switch (token.op) {
      case 'BT':
        tm = tlm = [1, 0, 0, 1, 0, 0];
        break;
      case 'Tm':
        tm = tlm = args.slice(-6);
        break;
      case 'Td':
        moveLine(args[args.length - 2], args[args.length - 1]);
        break;
      case 'TD':
        leading = -args[args.length - 1];
        moveLine(args[args.length - 2], args[args.length - 1]);
        break;
      case 'TL':
        leading = args[args.length - 1];
        break;
      case 'T*':
        moveLine(0, -leading);
        break;
      case 'Tj':
        if (args.length && args[args.length - 1].str !== undefined) show(args[args.length - 1].str);
        break;
      case "'":
      case '"':
        moveLine(0, -leading);
        if (args.length && args[args.length - 1].str !== undefined) show(args[args.length - 1].str);
        break;
      case 'TJ': {
        const arr = args[args.length - 1];
        if (Array.isArray(arr)) {
          show(
            arr
              .filter(function (part) {
                return part && part.str !== undefined;
              })
              .map(function (part) {
                return part.str;
              })
              .join('')
          );
        }
        break;
      }
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PdfText;
}
