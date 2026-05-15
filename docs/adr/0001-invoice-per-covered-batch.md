# Invoice per Covered Batch, not per Certificate

When a pool-check run covers several of a Student's Certificates at once, the automation drafts **one** Invoice listing all of them (one line item per Certificate) rather than one Invoice per Certificate.

An earlier design call was one-invoice-per-certificate, on the assumption that the historical multi-certificate invoices were a manual-effort shortcut. Reading the actual "Friendschool accounting" sheet reversed that: every historical invoice bundles multiple certificates (6–9 line items was common), and the invoice template is built around a multi-row line-item table. One-per-batch matches what MVA already receives and avoids sending them a burst of single-line emails when a session batch covers many certificates in one run.
