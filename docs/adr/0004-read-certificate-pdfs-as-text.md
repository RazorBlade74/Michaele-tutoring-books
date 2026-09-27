# Read certificate PDFs by parsing their text directly, not OCR or AI

Intake reads each Enrichment Certificate by parsing the PDF's own text: it inflates the page's content stream, replays the text-drawing operators to get each string and its position, and takes each field's value as the text printed to the right of its label on the same row (`CertExtractor`, `PdfText`, `ZlibInflate`). The Gemini call, its `GEMINI_API_KEY` script property, and its setup doc are gone.

Two earlier readers failed in production. Drive's PDF-to-Doc OCR dropped the right-hand money column, `TOTAL AMOUNT` included, and then regressed outright in May 2026 (#17). Slice 8 (#19) replaced it with Gemini 2.5 Flash, and in July 2026 `gemini-2.5-flash` began returning 404, which stopped intake until the digest was fixed to say why (#23). Both failures came from a service we don't control changing under us.

Looking at the actual files (checked on 2026-09-27 against two real certificates) showed neither reader was needed. MVA's certificates are all produced by iText 5.5 from one fixed template. Every field is real text in standard Helvetica with WinAnsi encoding, in one Flate-compressed content stream. The money column had been in the text all along; OCR lost it, probably because the page content is rotated.

Reading the text directly is:

- **Deterministic.** The same PDF always gives the same Certificate.
- **Loud when the template changes.** A missing or doubled label, a blank value, or an amount that isn't `$N.NN` throws a message naming the label, and the tutor sees it in the digest. A model can return a plausible wrong number, and nothing downstream would catch it.
- **Free of keys and accounts.** There is no API key to create, rotate or leak, and no billing posture to decide.
- **Private.** Children's names and amounts no longer leave the Google account. The AI Studio free tier used them for model training.
- **Not exposed to model retirement.** Nothing gets deprecated under us.

Positions differ slightly between certificates (a logo pushes the bottom block up 12pt, and value offsets vary), so fields are matched by label and row, never by fixed coordinates. Only page content streams are inflated. One certificate embeds a logo that inflates to about 16 MB, and decoding it would waste Apps Script's time and memory.

Apps Script has no raw zlib inflate. `Utilities.unzip` reads only zip archives and `Utilities.ungzip` only gzip, and both check a CRC-32 of the uncompressed data that a PDF stream doesn't carry. So we vendor tiny-inflate (MIT, about 400 lines), wrapped in one IIFE so it adds a single name to the shared global scope, and test it against Node's `zlib`.

The cost is that the reader is template-specific. If MVA changes its certificate template, intake flags every certificate until the parser is updated. That is the failure we want: visible, with the missing label named, rather than silently wrong. Test fixtures are real certificates scrubbed by `scripts/scrub-cert-pdf.js`, so the next template change can be captured the same way. Real certificate PDFs are gitignored.
