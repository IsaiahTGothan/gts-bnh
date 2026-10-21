# GTS Ops contract — `gts-ops/v1`

How GTS Hub (this repo, Next.js) and Clawson (`clawson-desktop`, Electron) exchange
reconciliation and Salesforce-finalization data. They live in **separate repositories**;
each carries its own copy of the schema, and both test against
[`gts-ops-v1.fixture.json`](./gts-ops-v1.fixture.json) (regenerate with
`node scripts/ops-fixture.mjs`). Exchange is by **file** (a person moves the JSON) —
neither app holds credentials for the other.

## Records

**GtsOrder**: from a GTS Hub Quick Log ticket (`lib/ops/ingest.js → gtsOrderFromTicket`)
`id, tag, orderNumber, orderKey, caseNumber, serviceType, description, tech, status,
createdAt, serviceStartedAt, serviceEndedAt, laborMs, loggedAt, unixLoggedAt (read-only), synthetic`

**SalesforceRecord**: one row of a Salesforce report export (CSV or JSON) (`importSalesforce`)
`id, batchId, orderNumber, orderKey, caseNumber, taskId, taskSubject, taskStatus, taskType,
hasTask, completed, openedAt/openedPrecision, completedAt/completedPrecision, owner, issues, synthetic`
Customer name / email / phone / address columns are **dropped on import**.

**Order-number normalisation**:
- Formatting is stripped: spaces, dashes, dots, `#` and an "Order:" label.
- Excel `.0` is removed.
- Leading zeros are **never** dropped, `O`/`0` are never swapped, and an Excel
  scientific value (`9.9E+09`) is never "repaired". Those records get
  `orderKey: null` and go to a person.

## Reconciliation statuses

| Status | Meaning |
|---|---|
| `MATCHED` | One ticket ↔ one task, consistent, both finished |
| `VERIFIED` | `MATCHED`, plus a human (or a live, read-back-verified Clawson run) confirmed this exact version (fingerprint) |
| `GTS_ONLY` | GTS served it; the export has nothing for that order |
| `SALESFORCE_ONLY` | Salesforce has it; there's no GTS ticket |
| `MISSING_TASK` | The order is in Salesforce but has no GTS task on it |
| `INCOMPLETE` | Paired, but the task is open, service is still running, or the description is missing |
| `CONFLICT` | Needs a person: near-identical order numbers, duplicates that don't pair, unreadable numbers, Case mismatch, or an impossible timeline |

Near-matches flagged: leading zeros, swapped neighbouring digits, one extra character.
They must be on the same day. A single different digit is **not** flagged, because B&H
order numbers are sequential.

## Review decisions (GTS Hub)

The decisions are `approve`, `edit` (approve with changed text, reason required),
`reject` (reason required), `investigate` (reason required), `reopen` and `verify`.
Every decision is signed and timestamped, and edits keep before/after.

An approval binds to `gtsFingerprint`. If the ticket changes, the approval is void.

A proposal is built **only from GTS data**:
- `completedAt` is `serviceEndedAt` or `null`, never a guess.
- It is blocked when service is still running or there is no description.

## `finalization-request` (GTS Hub → Clawson)

```jsonc
{ "contract": "gts-ops/v1", "kind": "finalization-request", "id": "fr_…",
  "createdAt", "createdBy", "store", "station", "synthetic", "containsSynthetic",
  "rules": { "requireDryRunFirst": true, "unix": "never", "maxItems": 50 },
  "items": [{
    "itemId", "gtsId", "gtsTag", "gtsFingerprint", "reconStatus",
    "action": "create_task" | "complete_task",
    "orderNumber", "sfCaseNumber", "sfTaskId", "subject", "description",
    "serviceType", "tech", "completedAt", "laborMinutes",
    "expected": { "taskExists": false } | { "taskExists": true, "taskId", "taskCompleted": false },
    "approvals": [{ "by", "at", "action" }], "synthetic"
  }] }
```

## `finalization-result` (Clawson → GTS Hub)

```jsonc
{ "contract": "gts-ops/v1", "kind": "finalization-result", "id", "requestId", "runId",
  "mode": "dry-run" | "live", "driver": "synthetic" | "…", "synthetic", "operator",
  "startedAt", "finishedAt",
  "items": [{ "itemId", "gtsId", "gtsFingerprint", "orderNumber", "action",
              "outcome": "planned" | "verified" | "unverified" | "skipped" | "failed",
              "message", "before", "after", "verifiedAt" }] }
```

The GTS Hub import is idempotent (`runId:itemId`):
- Only `mode: "live"` with `outcome: "verified"` counts toward `VERIFIED`, and only once
  a re-imported Salesforce export shows the record `MATCHED`.
- Synthetic results never verify real records.

## Rules both sides enforce

- Nothing is written to Salesforce without a named approval of the current fingerprint.
- A dry run of the same request comes first.
- Live, read the record → compare it to `expected` → skip it if it differs → write → read back → compare.
- **UNIX is never touched.**
- No customer/company data is sent to an AI provider. Clawson keeps this module out of its
  AI tool loop.
- Live Salesforce writes need B&H authorization, a Salesforce user with the right
  permissions, and the org's object/field mapping. **Until then only the synthetic driver
  exists.**
