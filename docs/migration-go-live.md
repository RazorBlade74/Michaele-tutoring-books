# Go-live migration runbook

Hand-curated migration of in-flight bookkeeping state from the old "Friendschool accounting" sheet into the new Sheet, so the automation takes over cleanly at go-live without losing work already in progress. This is the Slice 6 (issue #7) deliverable.

Not a parser. The old sheet is too messy (interleaved Friendschool charges, payments, typo'd and blank dates) to script reliably for a one-time job. Every figure below is determined by reading the old sheet with judgment and confirmed with the tutor before entry.

## What gets carried over, per active Student

For each active Student, exactly two kinds of rows land in their new Student Ledger tab:

1. **One `Certificate` row per genuinely-open uninvoiced Certificate** — a Certificate received from MVA that has **not** been included on any historical invoice in the old sheet. `Amount` is the negative `TOTAL AMOUNT`; `Certificate Number` is the real number (e.g. `MVA-128651-C010`). This lets the pool engine draw down against them in strict-FIFO order on day one.

2. **One opening `Session` row carrying the net uncovered Session Pool balance** — the delivered tutoring that has not yet been billed, computed as:

   ```
   opening_session = (total $ of Sessions delivered to date)
                   − (total $ of Certificates already covered by historical invoices)
   ```

   In other words: surplus delivered work carried forward. `Type = Session`, `Amount` = that dollar figure (positive), `Description` = `Opening balance (carryover from old sheet)`, `Date` = the day before go-live.

Why these two together — and nothing else: the new system recomputes pool coverage from the ledger every run. The opening Session refills the pool to where it actually stands; the open Certificate rows are what the pool draws down against. Historical Sessions and historical invoices do **not** get re-entered — they're collapsed into the opening Session figure.

## Active Students

From issue #7. Walk these in order; if a Student has no movement in the old sheet, they still get a roster row but no opening Session / Certificate rows.

| Student ID | Cert Name (full) | Tab Name (first name) |
| --- | --- | --- |
| 56239 | Phoebe Hansen | Phoebe |
| 128651 | Monique Garcia | Monique |
| 105009 | Riley Waleszonia | Riley |
| 110780 | Harper Waleszonia | Harper |
| 122084 | Zoe Emens | Zoe |
| 124281 | Elana Phung | Elana |
| 77251 | Kira Phung | Kira |
| 92472 | Heavenlee Alcala | Heavenlee |

`Cert Name` must match the full name MVA prints on the Certificate (it appears on the invoice). Confirm spelling with the tutor before entry — it is what AP sees.

`Tab Name` must exactly equal the Sheet tab name for that Student (case- and space-sensitive — `LedgerGateway` looks the tab up by this string).

## Phase 0 — Preflight

- [ ] The new Sheet exists and the bound Apps Script project is the one in this repo (latest deploy via `clasp push`).
- [ ] The `Config` tab exists with a roster block (header: `Student ID | Cert Name | Tab Name | Active?`) and a settings key/value area (`Go-Live Date`, `Next Invoice Number`, `Business …`, `Bill To …`, `Invoicing Email`, `Default Line-Item Description`, `Tutor Email`).
- [ ] `Tutor Email` is set to the inbox that should receive the daily digest (e.g. `lamp.post.tutoring@gmail.com`). If absent, the orchestrator still completes its run but silently skips the digest send — easy miss to debug after-the-fact.
- [ ] One empty tab per active Student exists, with the header row `Date | Type | Description | Amount | Certificate Number | Status`. Add a data-validation dropdown on `Type` (`Certificate | Session | Invoice | Payment | Charge`) so future hand-entered rows can't drift.
- [ ] The old sheet (Drive id `1ztqWCsImlis9BdDFzJIuMDaINzgndc0esRS0poYbacI`) is open in another tab for reference.

## Phase 1 — Roster

For each row in the **Active Students** table above, add a row to the Config tab roster block:

| Student ID | Cert Name | Tab Name | Active? |
| --- | --- | --- | --- |
| `56239` | `Phoebe Hansen` | `Phoebe` | `TRUE` |
| ... | ... | ... | ... |

Confirm `Cert Name` with the tutor for any Student you're not sure about (especially the second Phung child, `77251`).

## Phase 2 — Per-Student walkthrough

For each active Student, before touching the new Sheet, fill in the worksheet below and **walk through it with the tutor** end-to-end. Only after the tutor confirms the numbers do you transcribe them into the new tab.

### Worksheet (one copy per Student)

```
Student: ____________________  ID: ____________  Tab: ____________

A) Open uninvoiced Certificates (received but never on a historical invoice)
   - one row per Certificate; oldest seq first

   Certificate Number      DATE ISSUED   TOTAL AMOUNT   CLASS/ACTIVITY — SERVICE DATE(S)
   ____________________    ___________   ____________   __________________________________
   ____________________    ___________   ____________   __________________________________
   ____________________    ___________   ____________   __________________________________

B) Net uncovered Session Pool balance

   Total $ of Sessions delivered to date     ___________
   Total $ of Certificates already invoiced  ___________
   Opening Session amount  (A − B)           ___________

C) Sanity check with the tutor
   - "Does this open-cert list match what you'd expect?"            ☐ yes  ☐ no — investigate
   - "Does the opening pool balance match your gut?"                 ☐ yes  ☐ no — investigate
   - "Will the next invoice draft cover __________ for $__________?" (your prediction)
```

### Determining the open-cert list

In the old sheet, walk the Student's tab top-to-bottom. For each Certificate-style entry:

- Find its Certificate Number (the `MVA-{studentId}-C{seq}` value).
- Check whether it appears on any historical invoice line on that same tab (or wherever the tutor recorded invoices). If yes → it's been invoiced, **exclude** from list A. If no → **include**.
- Note the `DATE ISSUED`, `TOTAL AMOUNT`, and the `CLASS/ACTIVITY — SERVICE DATE(S)` strings from the original certificate PDF (search Gmail by Certificate Number if the old sheet's wording is ambiguous).

If a Certificate's status is genuinely unclear (typo'd dates, "did I bill this?" questions), park it on a separate **questions** list and resolve it with the tutor before continuing — do **not** guess.

### Determining the opening Session amount

The opening Session is whatever surplus pool the tutor has accumulated that historical invoicing has not yet eaten. Two equivalent ways to compute it; both should agree:

1. **Forward method.** Sum every Session-like row in the old sheet (lessons delivered, no-shows that were still charged, late-cancellations that were still charged). Subtract the total `TOTAL AMOUNT` of every Certificate that the old sheet shows as already invoiced.

2. **Backward method.** From the tutor's gut: "as of today, how much delivered tutoring do I have on the books that hasn't yet been billed to MVA?"

If the two diverge by more than a rounding error, stop and resolve with the tutor — it usually means the old sheet has a Session entry that isn't actually delivered work, or an invoice that wasn't recorded, or both.

A negative opening balance is suspicious (it would mean the tutor invoiced for more than they delivered). Surface it to the tutor rather than entering it.

### Entry into the new Sheet

Once the worksheet is signed off, on the Student's tab append:

1. One **Certificate row** per entry in list A, in `seq` order:

   ```
   Date              = DATE ISSUED from the certificate PDF
   Type              = Certificate
   Description       = CLASS/ACTIVITY — SERVICE DATE(S)
   Amount            = -TOTAL AMOUNT   (negative)
   Certificate Number= MVA-{studentId}-C{seq}
   Status            = (leave blank)
   ```

2. One **opening Session row**:

   ```
   Date              = day-before-go-live
   Type              = Session
   Description       = Opening balance (carryover from old sheet)
   Amount            = (the figure from worksheet line B; positive)
   Certificate Number= (leave blank)
   Status            = (leave blank)
   ```

If list B is zero (no surplus delivered work), skip the opening Session row entirely. If list A is empty (no open Certificates), skip those rows too — the tab just sits empty until intake writes its first row.

## Phase 3 — Go-live date

On the Config tab, set `Go-Live Date` to the cutover day. Intake will ignore any MVA certificate email dated on or before that day, which means the certificates you just carried over by hand won't be re-entered when their original Order email gets re-processed. Dedup-by-Certificate-Number is the backstop if the date check ever drifts.

`Next Invoice Number` should already be set; if not, set it to `{currentYear}-001` (or to one-past the last historical invoice number, if you want the new sequence to continue without a visible gap).

## Phase 4 — Sanity check (`Migration dry run`)

In the Sheet menu, choose **Lamp Post Tutoring → Migration dry run**. It reads every active Student's ledger and reports, **read-only**:

- the Session Pool total it sees,
- the uninvoiced Certificates in `seq` order,
- what the next pool-check run **would** draft (Covered Batch + dollar total).

Compare each section against worksheet line C ("the next invoice draft will cover `X` for `$Y`"). If everything lines up: migration is good. If a Student shows something you weren't expecting, do not run the daily trigger yet — re-walk that Student's worksheet, find the off-by-one, and re-enter.

The dry run writes nothing — no Gmail draft, no rows, no counter advance. Safe to re-run as many times as needed.

## Phase 5 — Cutover

Once the dry run looks right for every active Student:

- [ ] In the Apps Script editor, run `installDailyTrigger` once (idempotent — deletes any existing `runAll` trigger first).
- [ ] Open the Sheet so Apps Script picks up `onOpen` and the `Lamp Post Tutoring` menu appears.
- [ ] First daily run lands the next morning ~06:00 Pacific. If you want to confirm sooner, use **Lamp Post Tutoring → Run now**.
- [ ] After the first real run, spot-check the digest email against expectations.

## Acceptance criteria (issue #7)

- [ ] Every active Student's roster row exists on the Config tab (Student ID → Tab Name).
- [ ] For each active Student, open uninvoiced Certificates are entered as `Certificate` rows in their ledger.
- [ ] For each active Student, one opening `Session` row carries the net uncovered Session Pool balance.
- [ ] Carryover figures were sanity-checked with the tutor before entry (worksheet line C signed off).
- [ ] The go-live date is set on the Config tab.
- [ ] A `Migration dry run` after migration produces sensible Covered Batches — no spurious invoices, no missed open certs.
