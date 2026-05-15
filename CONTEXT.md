# Lamp Post Tutoring — Enrichment Certificate Bookkeeping

Automation context for Lamp Post Tutoring (sole proprietor: Michaele LePenske).
Ingests Mission Vista Academy (MVA) enrichment certificates from email into a
per-student Google Sheet ledger, and drafts invoices back to MVA once delivered
tutoring covers a certificate.

## Language

**Enrichment Certificate** (aka Certificate):
A single PDF approval from MVA authorizing a dollar amount of tutoring for one
student. Identified by a **Certificate Number** like `MVA-56239-C055`. Each
certificate is an independent unit of work — one **Order** email may carry many.
Fixed-template PDF; fields: `CERTIFICATE NUMBER`, `STUDENT NAME` (full name),
`SCHOOL NAME`, `VENDOR NAME`, `CLASS/ACTIVITY`, `SERVICE UNIT` (Per Hour / Per
Month), `NOTES`, `SERVICE DATE(S)`, `AMOUNT PER UNIT`, `MATERIALS FEE`,
`TOTAL AMOUNT` (the approved amount), `ORDER NUMBER`, `DATE ISSUED`,
`ENRICHMENT SPECIALIST`, `EMAIL`, `CANCELLATION REQUIRED BY`. The PDF text layer
extracts the left-column fields cleanly but drops the right-hand money column
(`TOTAL AMOUNT` included) — OCR is required to capture the approved amount.
_Avoid_: cert email, approval doc

**Order**:
An MVA transaction identified like `2026-MVA-H0061403`, announced by one email
thread from `notifications@missionvistaacademy.org`. One Order fans out to
one-or-many Enrichment Certificates (one observed Order carried 8). The Order is
**not** the unit of work — the Certificate is.

**Certificate Number**:
Identifier of the form `MVA-{studentId}-C{seq}` (e.g. `MVA-128651-C005`). The
embedded **Student ID** is the reliable routing key.

**Student ID**:
The numeric id embedded in every Certificate Number (e.g. `128651`). Stable join
key between a certificate and a Student. Preferred over name matching, which is
fuzzy (siblings share last names; cert name format differs from tab name).

**Student**:
A tutored child. Each has one tab in the accounting Sheet. The certificate
carries the student's full name ("Monique Garcia"); the tab is titled by first
name ("Monique"). The roster's `Cert Name` column holds that full name verbatim,
and it is what appears as the Student name on the invoice. The **Config tab**
maps Student ID -> tab.

**Config tab**:
A single setup tab in the new Sheet. Holds the student roster (one row per
Student: Student ID | Cert Name | Tab Name | Active?, keyed by Student ID) plus
invoice-generation settings (vendor/business details, the next invoice number,
the `invoicing@missionvistaacademy.org` address, and the default invoice
line-item description — `Core academics tutoring`, applied to every line). Invoice numbers are a clean
global counter `{YYYY}-{NNN}` (e.g. `2026-001`) that resets each calendar year;
a rejected draft burns its number (gaps are fine). A certificate whose Student ID
has no roster row is not written — the automation flags it to the tutor, who
adds the roster row + tab; intake picks it up on the next run.

**Service Period**:
The certificate's `SERVICE DATE(S)` field — either a specific day
("Apr 01, 2026") or a whole month ("May 2026"). Recorded as a free-text note in
the ledger Description and on the invoice. NOT a Session-matching constraint —
fulfilment is a date-agnostic per-Student pool (see **Session Pool**); the
service period is a label only.

**Student Ledger** (a tab):
A tab in the new accounting Google Sheet, one per Student, holding that
Student's Certificates, Sessions, and other bookkeeping rows as a single typed
ledger. Every row carries a **Type** tag (`Certificate` / `Session` / `Invoice`
/ `Payment` / `Charge`) and a single signed **Amount** column. Sign convention:
**Session** is positive (work delivered / value earned), **Certificate** is
negative (approved budget drawn down against). The automation filters by Type to
run the pool math; a human reads one running-balance column. Remaining column
layout is being (re)designed — see "The new Sheet" below.

**The new Sheet**:
A clean Google Sheet being designed from scratch to replace the hand-grown
"Friendschool accounting" sheet. The old sheet is **reference only** — its
invoice format is liked and will be carried forward; nothing else about its
structure is binding. Old sheet Drive id (reference):
`1ztqWCsImlis9BdDFzJIuMDaINzgndc0esRS0poYbacI`. In the old sheet, current
students are the first-name tabs (Phoebe, Harper, Riley, ...); last-name-style
tabs (e.g. "hansen phoebe", "hoge", "josiah") are inactive/old.

**Session**:
One billable tutoring appointment, hand-entered by the tutor as a ledger row
tagged `Type = Session` (a dropdown — the automation never infers Session from
an untyped row). `Amount` is the dollars charged, billed at the certificate's
approved rate (`AMOUNT PER UNIT`). A session cancelled late or a no-show still
counts if it was charged — economically it is a delivered session. A session
cancelled in time gets no row (or `Amount` 0).

**Session Pool**:
The running sum of a single Student's logged Sessions. Per-Student only — a
Student's sessions never count toward another Student's certificates (true even
for siblings). Date-agnostic: all of that Student's sessions pool together
regardless of when they occurred. Certificates draw down the pool in strict
receipt order (see Relationships).

**Invoice**:
A request for payment sent to MVA's invoicing department
(`invoicing@missionvistaacademy.org`) for a **Covered Batch** — one or more
Certificates for a single Student. One line item per Certificate: Description /
service-period Date / PO = Certificate Number / price. The line-item
**Description** is derived from the Certificate's `CLASS/ACTIVITY`: `Group
Tutoring - …` → the Config tab's `Default Line-Item Description` (currently
`Core academics tutoring`); `Individual Tutoring - X` → `X` (e.g. `math`,
`Language Arts`); anything else → the default. See ADR 0003. Generated from a
Google Doc template, exported to PDF into a Drive `Invoices` folder, and
attached to a Gmail draft to `invoicing@missionvistaacademy.org` — reviewed and
sent by the tutor. Recorded in the Student Ledger as **one `Invoice`-type row per
Certificate** in the batch — each carrying that Certificate's number in the
single `Certificate Number` column, the run date, the billed amount (positive),
and the batch's invoice number as its `Description` — all sharing a **Status**
of `Draft` -> `Sent` -> `Paid` (see ADR 0002 for why one-row-per-Certificate
rather than one-row-per-Invoice). The existence of an `Invoice` row is what
tells the automation that Certificate is invoiced (so it won't re-draft); the
Status is for the tutor's bookkeeping and is advanced by hand.

**Covered Batch**:
The set of Certificates for one Student that all become fully covered by that
Student's Session Pool in the same pool-check run. The FIFO draw-down covers a
contiguous prefix of uninvoiced Certificates; whatever crosses the "covered"
line in a given run is invoiced together as one Invoice. A batch can be a single
Certificate.

**Friendschool charge**:
A monthly tuition line unrelated to MVA certificates. Out of automation scope,
but still lives in the Sheet because the tutor does all bookkeeping there.

## Relationships

- An **Order** carries one or more **Enrichment Certificates**
- A **Certificate Number** embeds a **Student ID**, which routes the certificate
  to one **Student** / **Student Ledger**
- A **Certificate** has a **Service Period** (a day or a month) — label only
- A **Student's** **Sessions** accumulate into that Student's **Session Pool**
- The **Session Pool** draws down **Certificates** in strict receipt order: the
  oldest uninvoiced Certificate must be fully covered before any newer one can
  be fulfilled (no skip-ahead). Receipt order = the **Certificate Number**'s
  sequence number (`C{seq}`) ascending — sequential per Student, never reused,
  so `seq` alone is a total order. The automation derives order by sorting on
  `seq`, not by physical row position.
- The **Certificates** that become covered in one pool-check run form a
  **Covered Batch**, billed together as one **Invoice** (one line item each)

## Flagged ambiguities

- **Invoice granularity** — RESOLVED: one invoice per **Covered Batch** (all
  Certificates for a Student that become covered in the same pool-check run).
  Reverses an earlier "one invoice per certificate" call after the historical
  sheet showed every invoice was multi-certificate. See ADR 0001.
- **Session -> Certificate matching** — RESOLVED: per-Student, date-agnostic
  Session Pool; strict-FIFO draw-down by Certificate receipt order, no
  skip-ahead. Service period is an invoice label, not a matching constraint.
- **Roll-over** — tutor first said unused approval does not roll over, then
  corrected: it DOES roll over. RESOLVED: certificates roll over; invoicing is
  gated on delivered work covering the certificate, not on month-end.
- **MVA cancelling or reissuing an already-issued Certificate** — OPEN. The
  intake/dedup model assumes a Certificate Number is write-once. What happens if
  MVA voids or amends a cert after issuing it is not yet designed; handled
  manually for now. Revisit in the PRD.

## Example dialogue

> **Dev:** When the Monique Garcia Order arrives with 8 Certificates, what gets
> written to the Student Ledger?
> **Tutor:** 8 rows on Monique's tab — each certificate is its own row, amount
> as a negative in column E. They're additive toward what's approved.
> **Dev:** And the Invoice?
> **Tutor:** Not yet — only once I've delivered enough Sessions to cover a
> Certificate. When a pool check covers several at once, they go on one Invoice
> as a Covered Batch. The automation drafts it and I approve and send.
