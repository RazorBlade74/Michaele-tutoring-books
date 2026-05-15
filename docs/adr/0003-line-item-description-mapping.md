# Invoice line-item description is derived from cert CLASS/ACTIVITY, not a single default

Each invoice line item's `description` is derived from the Certificate's `CLASS/ACTIVITY` field according to the following rule:

- `Group Tutoring - …` → the Config tab's `Default Line-Item Description` (currently `Core academics tutoring`)
- `Individual Tutoring - X` → `X` (e.g. `math`, `Language Arts`)
- anything else / blank → `Default Line-Item Description`

The original PRD (issue #1) user story 17 said "every invoice line item to use a single configurable default description". That captured only the Group-Tutoring case. The historical "Friendschool accounting" sheet — and the tutor's own walkthrough during Slice 6 go-live — confirm that Individual-Tutoring lines carry the *subject* on the invoice, not the umbrella `Core academics tutoring` label. MVA's accounts payable expects the subject so they can reconcile against the certificate. The fix landed in `InvoiceDocBuilder.toTemplateValues` (issue #13) and is unit-tested against each rule branch.

The `Default Line-Item Description` setting remains, repurposed: it is the Group-Tutoring label and the fallback for unrecognised class/activity strings. If a new certificate shape appears that fits neither rule, it falls back to the default and the tutor edits the draft once; we revisit the mapping rather than letting it silently mislabel future drafts.
