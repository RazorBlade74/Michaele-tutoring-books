# Invoice ledger rows: one per Certificate, not one per Invoice

When the automation drafts an invoice for a Covered Batch, it writes **one `Invoice`-type ledger row per Certificate in the batch** — each carrying that Certificate's number in the single `Certificate Number` column and sharing the batch's invoice number in its `Description` — rather than a single `Invoice` row for the whole batch.

The PRD and `CONTEXT.md` described this as "an `Invoice` row" (singular), which left the encoding open: the ledger has one `Certificate Number` column per row, but a Covered Batch is one-or-many Certificates. PoolEngine has to read the ledger back and exclude already-invoiced Certificates from the draw-down, so the `Invoice` rows must record *which* Certificates each invoice covered.

Two alternatives were considered and rejected. Listing every covered Certificate Number inside one `Invoice` row's `Certificate Number` cell fights the ledger's one-value-per-column contract and the `Type`-filtered pool math, and would need delimiter parsing. Storing only a boundary `seq` ("this invoice covers everything through C010") is compact but couples correctness to the strict-FIFO contiguous-prefix invariant being unbreakable — a void/reissue or a hand-edit would silently corrupt the exclusion set.

One row per Certificate keeps `Certificate Number` single-valued, lets PoolEngine treat "this Certificate Number appears on any `Invoice` row" as the invoiced test with no parsing, survives non-contiguous edge cases, and reads naturally in the human-facing ledger (each Certificate line is followed by its `Invoice` line). The cost — several rows per invoice instead of one — is cheap in a per-Student ledger.
