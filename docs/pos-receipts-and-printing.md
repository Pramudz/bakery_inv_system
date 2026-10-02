# POS receipts and local printing

## What changed

Previously, a sale used an invoice ID derived `invoiceNumber` and a refund used an ID derived `refundNumber`; neither was a daily POS sequence. Receipt views could use current configuration or fixed sample bakery contact text. Checkout already had an idempotency key and transactional posting, while register and cashier sessions controlled billing and reconciliation. Browser printing used the operating system print dialog; there was no local raw ESC/POS bridge.

New sales have `business_date`, `bill_no`, printed location and register codes, `issued_at`, and a versioned receipt snapshot. New refunds have independent `refund_no` and their own snapshot, including the original sale's printed reference. Historical rows keep the new identity columns `NULL`; they are labelled legacy and are not assigned fictitious bill numbers. The old `invoiceNumber` and `refundNumber` remain internal compatibility references and are not printed on new POS receipts. A stored `MASTER` receipt code is reserved for master registers; terminal code `MASTER` is refused. Master cashiers can work without a paired terminal. Terminal codes remain unique within a location, and both locations can have `POS1`.

## Printed identity and day boundary

Sale lookup and the database unique constraint use `(tenant_id, business_date, printed_location_code, printed_register_code, bill_no)`. The sale counter uses exactly those same fields. Refund uniqueness and its counter use `(tenant_id, business_date, printed_location_code, refund_no)`; the optional processing POS code is descriptive, not part of the refund sequence. The server snapshots codes and staff/header fields when the document is issued, so later renaming, terminal replacement, pairing changes, mode switches, or address edits do not rewrite it. Returning to an old code continues that code's counter for the day.

The tenant's configured IANA time zone determines `business_date` at the point of finalization. The rollover is local **00:00**, with no extra shift cutoff. `issued_at` stores the actual instant separately. A checkout begun before midnight but finalized after it receives the new day's number. All lookup and reprint operations use the stored date. The time zone is already fixed against ordinary tenant updates in this system.

Example sale receipt (illustrative values):

```text
Bakery Company Ltd
Bandaragama Outlet
12 Main Road, Bandaragama
SALE RECEIPT
Date:      02/10/2026 10:42
Location:  BANDA
POS:       POS1
Cashier:   C17 / N. Perera
Bill No:   0001
Bread              2 x 120.00      240.00
Discount                             20.00
Total                               220.00
Cash applied                        220.00
Cash tendered                       250.00
Change                               30.00
```

Example refund receipt:

```text
Bakery Company Ltd
Bandaragama Outlet
12 Main Road, Bandaragama
REFUND RECEIPT
Date:      02/10/2026 11:05
Location:  BANDA
POS:       MASTER
Refund No: 0001
Processed by: C21 / S. Silva
Original sale
Date:      02/10/2026
Location:  BANDA
POS:       POS1
Bill No:   0001
Bread              1 x 120.00      110.00
Refund Total                        110.00
```

The refund screen searches by the four sale fields visible on paper, checks tenant/location permission, and shows prior refunds, quantities, value remaining, and original paid/credit position. Sale, refund, pending collection, and later payment histories use server pages and search. Receipt previews and browser print use the archived snapshot; the local agent renders that same snapshot into 58 mm or 80 mm ESC/POS. Sale and refund reprints are audited and marked `COPY`. New receipt headers use the tenant name and location address. The printer administration screen flags a missing address; complete it in location administration instead of using a sample address.

## Database and payment boundaries

The InnoDB counter row is inserted and locked with `FOR UPDATE` inside the sale or refund transaction. There is no `MAX(number) + 1` query or session-local counter. Checkout commits its invoice, lines, payment/credit, inventory entries, register attribution, receipt number/snapshot, and print outbox row together. Refund finalization locks the invoice and commits refund lines, stock returns, refund payments, cash movement where money is physically paid out, receipt number/snapshot, and print outbox row together. A failed transaction rolls back the counter increment and financial writes. Unique keys provide a final defense against duplicate printed identities. Idempotency keys return the committed document on retry, including its number.

Later collections, payment reversals, discount adjustments, register counts, and master-funded payout actions remain separate database operations with their own transaction and idempotency/uniqueness controls. The sale receipt preserves its original payment position; later collections do not rewrite it. Refund cash payout posts to the active **processing** cashier session, or an explicitly selected active master register for a master-funded payout, rather than the original seller's session. A refund can be finalized with money still payable; its actual payment rows and physical cash movements record later settlement. Partial refund amounts are checked against the original line's unrefunded net value as well as quantity. The source invoice lock serializes competing refunds.

The printer and external card/cheque networks are outside MySQL ACID. Committing a document never waits for paper output. A local agent claims a durable `PENDING` job after commit and reports `PRINTED` or `FAILED`. A crashed claim expires after two minutes and can be reclaimed. The agent records completed `(job, attempt)` pairs locally before acknowledging so a lost acknowledgment can be retried without sending the same attempt again. If the printer accepted paper but no acknowledgment reached the agent, a later attempt can still produce a second copy; check the physical printer before retrying. A retry or browser reprint never resubmits a sale or refund. Card provider reversals, if introduced, require a separate provider reconciliation workflow; the current code records internal payment reversals and physical cash movements, not an atomic provider reversal.

## Configure the local agent

1. In **Register Management → Terminals → Receipt printer**, select a location default profile or a terminal override. Choose `TCP` for a local Wi-Fi/Ethernet ESC/POS printer, or `WINDOWS_QUEUE` for a USB/OS queue. Enter a private IPv4 address and printer port (often 9100) or the exact Windows queue name. Set paper width, encoding, cut option, and use **Test print**. The target is managed by an administrator; the cashier cannot submit arbitrary network targets or raw printer commands.
2. Save the profile and copy the one-time agent token. Put the profile ID shown in the saved profile and the token into a workstation-only `print-agent/agent-config.json`:

   ```json
   {
     "serverUrl": "https://your-erp.example/",
     "profileId": 12,
     "agentToken": "64-character-token-from-administration",
     "statePath": "C:/BakeryPOS/print-state.json"
   }
   ```

   The configuration and state files are local secrets and are ignored by Git when kept in `print-agent`. Use HTTPS for a remote server. Rotate the token in administration if the workstation is replaced or the token is exposed.
3. Install Node.js 20 or newer on the cashier workstation. In `print-agent`, run `npm ci`, then `node agent.mjs agent-config.json`. For unattended Windows startup, make a Task Scheduler task under the cashier/service account: trigger **At log on** (or **At startup** for a service account), action `node.exe`, arguments `agent.mjs C:\BakeryPOS\agent-config.json`, start in the installed `print-agent` directory, and enable automatic restart on failure. Restart that task after changing its local configuration.
4. For a network printer, assign/reserve its private IP, enable its ESC/POS raw TCP service and confirm the chosen port from the same workstation. For USB, install its Windows driver, give the service account permission to use that queue, and ensure RAW passthrough accepts ESC/POS bytes. A graphical driver that transforms the bytes is not a suitable raw queue.
5. Check **Recent print jobs** for `PENDING`, `CLAIMED`, `PRINTED`, or `FAILED`; test network reachability or Windows queue status and then use **Retry / reprint**. Cashiers see status on the sale/refund receipt and can use ordinary browser/OS print. Browser print opens a dialog and is not silent ESC/POS printing.

On-device acceptance: test 58 mm and 80 mm widths as available, long product/company/address wrapping, non-ASCII names with the chosen code page, cash change and split tender, credit balance, a refund with original reference, cut behavior, offline failure, retry after recovery, agent restart after claim, and a lost acknowledgment with physical paper inspection. Both transport paths have fake-adapter tests; no physical printer was available for this implementation.

## Migrations and verification

Migrations `1770000036000`, `1770000037000`, and `1770000038000` add the receipt identities/counters, print profiles/jobs/audit, and nullable terminal attribution for unpaired master cashiers. Migration `0036000` stops if an existing terminal uses reserved code `MASTER`; rename it before running the migration. Take a normal backup, inspect existing terminal codes and location addresses, then run migrations in the intended environment. **Do not target `dev_erp` for a trial run.** The disposable MySQL integration test creates its own generated database, runs baseline and new migrations, and checks upgrade history and concurrency. Run `npm run test:pos-receipts:mysql` from `backend`, plus `npm test` in `backend` and `print-agent` and `npm run build` in `frontend`.

The operational POS Bill No is separate from a statutory VAT tax-invoice serial. The existing ERP did not provide a distinct compliant tax-invoice numbering flow here. Sri Lanka's [VAT tax invoice rules](https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2481-22_E.pdf) and [2026 amendment effective 1 October 2026](https://www.ird.gov.lk/en/publications/Gazette_Documents/2026_2500_106_E.pdf) require an accountant/tax adviser to confirm whether and when this business must issue a separate tax invoice and how its serial must be maintained. Do not treat a daily resetting Bill No as that statutory serial.
