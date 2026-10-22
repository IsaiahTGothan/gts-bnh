# GTS Operations Intelligence: progress log

Two repos, one contract (`gts-ops/v1`, see [CONTRACT.md](./CONTRACT.md)). Both are on branch
`claude/dreamy-sagan-bf7ztw`: **GTS Hub** (`gts-bnh`) and **Clawson** (`clawson-desktop`, commit
`262745a`). Neither is merged or deployed.

## Completed

| Phase | Where | What |
|---|---|---|
| 1 Foundation | both | Shared schema/contract, statuses, order-number normaliser, shared synthetic fixture (byte-identical in both repos) |
| 2 Ingestion + reconciliation | GTS Hub `lib/ops/ingest.js`, `reconcile.js` | Salesforce report CSV/JSON import (alias column mapping, title-block/totals skip, PII columns dropped, Excel damage flagged); 7 statuses; ambiguity → CONFLICT, never merged |
| 3 Review queue | GTS Hub `lib/ops/review.js`, Ops tab | Approve / Edit (reason + before/after) / Reject / Investigate / Reopen / Verify; signed + timestamped; fingerprint-bound approvals; manager-only approve/edit/reject |
| 4 Supervised finalization | Clawson `src/main/services/gtsOps/` + "GTS Ops" page | Request validation, mandatory dry run of the exact request, typed confirmation, per-item read → compare to `expected` → write → read back. Breaker at 3; UNIX / unknown actions refused; JSONL audit log; kept out of the AI brain; window content-protected while open. **Synthetic driver only** |
| 5 Turnaround | GTS Hub `lib/ops/turnaround.js`, Ops tab | Elapsed vs hands-on labor vs Salesforce opened→completed, kept separate; unknowns counted, never estimated; filters for tech, service, status and synthetic |
| 6 EOD reports | GTS Hub `lib/ops/report.js`, Ops tab | PDF (print), Excel (SpreadsheetML), CSV (formula-safe), JSON; synced searchable history; synthetic labelled |
| 7 Connect back | GTS Hub `lib/ops/exchange.js` | Request export (approved, non-stale only); idempotent result import; only live, read-back-verified, non-synthetic results verify real records |
| 8 Testing | both | See below |

## Tests passed (run, not assumed)

- GTS Hub `npm test`: **20/20** (synthetic data). The test also checks that the docs fixture matches what the engine produces.
- GTS Hub `npm run build`: passes.
- GTS Hub browser E2E (Playwright against a production build): **22/22**. It covers:
  - sandbox → verify → approve / edit / investigate → request export → result import (twice) → all report formats → history search;
  - proof the sandbox wrote nothing to the store;
  - a real-mode CSV import, with the customer name not stored.
- Clawson `npm run test:gts-ops`: **96 ok, 0 fail**. Plus `npm run typecheck` (clean) and `npm run build` (passes). Each of 5 deliberately broken guards made the suite fail.
- Cross-repo: a Clawson live (synthetic) result imports into GTS Hub, and a re-import adds nothing.

## Not verified

- **No live Salesforce or GTS integration has been tested.** No authorized environment was available.
- Clawson window content protection on Windows/macOS. It was only exercised on Linux, where it does nothing.
- Column aliases were not tested against a real B&H Salesforce report.

## Blockers / approvals needed

1. **B&H authorization** to automate any Salesforce write (management + Salesforce admin).
2. A Salesforce user with the right permissions (least privilege), plus the org's object/field mapping (where GTS tasks live, which fields mean "completed"). Without it, no live driver will be written.
3. A sample real Salesforce report export (it can be redacted) to confirm the column mapping.
4. Policy sign-off before any order data goes near an AI provider. Today nothing does: the module is excluded from Clawson's brain.
5. UNIX: out of scope. Nothing reads or writes it beyond GTS Hub's existing manual flag.

## Remaining work (after the approvals above)

- A live Salesforce driver in Clawson, behind the same guards, tested first in a Salesforce sandbox org.
- Optionally scheduled export pickup, if IT provides a sanctioned report delivery.
