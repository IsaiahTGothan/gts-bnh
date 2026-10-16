# GTS Hub — handoff for the B&H software department

GTS Hub is the work tracker built at the B&H Guest Technical Services (GTS) counter in the NYC SuperStore. Managers asked for it to go to the software department. This page explains how it works, how it runs, and what an enterprise rollout would need.

A live version of this page, filled in with the current settings and deployment health, can be downloaded from **Management → System → Configuration → Technical handoff**.

---

## 1. What it does

| Area | Purpose |
|---|---|
| **Quick Log** | Logs every counter customer in seconds. The order number goes in first. The ticket is then pushed to Salesforce (as a real Case, through the connector) and to UNIX (through a barcode scan bridge). A **service clock** runs on every ticket, from start to Done. Customers watch a 3D stage while the tech types. There is also a walk-in queue, multi-select with bulk actions, and an archive. |
| **Assignments** | Overnight drop-offs: intake, pipeline, hold-time alerts, automatic criticality, work log, printed tags. |
| **Stats** | Customers served, customers per hour and per open hour, service time (average, median, 90th percentile, % within target, by type and by tech), order-number rate, Salesforce and UNIX coverage, hold times, a heatmap, CSV exports and a printable end-of-day report. |
| **Warranty** | 56 manufacturer brands. Each one has its official warranty and repair pages, a phone number, what the customer needs to bring, and a QR code the customer scans. |
| **Management** | Team, alerts, daily goal, manager PIN, connections. The **System** section covers store hours, service targets, ticket rules, features, security, privacy, the warranty directory, integrations, diagnostics, and config import/export. |
| Catalog · Station · Firmware | Service catalog, bench inventory, shift handoff, and the Camera Firmware Hub. |

## 2. Architecture

```
Browser (counter PC / iPad / phone)
  Next.js 15 App Router · React 19 · hand-rolled design system · three.js (lazy, Quick Log only)
  state = one JSON object → localStorage['gts-hub:state'] (debounced)
        │  fetch (x-gts-key = team passcode)
        ▼
Vercel (Node runtime API routes)
  /api/sync        compare-and-set on one JSON document, record-level merge on conflict
  /api/salesforce  OAuth 2.0 client-credentials → creates Case
  /api/webhook     relays events to an HTTPS endpoint (Teams / Slack / Power Automate / internal)
  /api/linkcheck   checks warranty links server-side
  /api/health      uptime probe (no auth, no data)
  /api/keepalive   daily cron (vercel.json) so a free Supabase project never pauses
        │
        ▼
Supabase (optional): table public.gts_sync (RLS on, service-role key server-side only)
                    Realtime broadcast + presence on channel "gts-sync"
```

* **Sync model.** The shared board is a single document. Each record carries `updatedAt`, and deletions are tombstones (`deletedAt`, kept 30 days). On merge, the newest version of a record wins. Output is canonical, so devices converge. The `management` document merges as a whole; newer versions win.
* **Local mode.** Without Supabase, each browser keeps its own data. Everything except the shared board still works.
* **Security today.** The app has no user logins. Access works like this:
  * A shared **team passcode** gates every API route. It is SHA-256 hashed and salted on the server.
  * A **manager PIN** (SHA-256 hashed) gates Management, and Management locks itself again after a set idle time.
  * Per-permission switches control what techs may do: delete, edit times, export, reset.

## 3. Data model (main records)

| Collection | Key fields |
|---|---|
| `tickets` | `tag`, `orderNumber`, `customerName`, `serviceType`, `description`, `tech`, `status` (open / logged / converted), `createdAt`, `loggedAt`, `sfCaseNumber`, `unixLoggedAt`, `logSeconds`, **`serviceStartedAt`, `serviceEndedAt`, `servicePausedAt`, `servicePausedMs`**, `warrantyBrand`, `serial`, `queueId`, `archivedAt`, `deletedAt` |
| `assignments` | overnight jobs: customer, phone, device, issue, status pipeline, tasks, log, `receivedAt`, `readyAt`, `pickedUpAt` |
| `queue` | walk-ins: `name`, `reason`, `serviceType`, `status` (waiting / serving / served / left), `joinedAt`, `servedAt`, `ticketId` |
| `activity` | audit trail, capped at 400: `ts`, `tech`, `action`, `label`, `detail` |
| `management` | goal, PIN hash, store code, hours, service targets, rules, features, permissions, privacy, webhook, warranty overrides |
| `team`, `broadcasts`, `inventory`, `gear`, `checklist` | roster, alerts, bench gear, firmware entries, daily checklist |

**Service time** = `serviceEndedAt − serviceStartedAt − servicePausedMs`. The logic is in `lib/service.js` and covered by the checks in section 7.
**Customers served** = every ticket, plus every drop-off that did not start as a ticket. This rule counts each customer once.
**Customers per open hour** = customers ÷ open hours in the range. Open hours come from the store hours set in Management → System.

## 4. Configuration

| Where | What |
|---|---|
| Vercel env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `POSTGRES_URL` (one-time table creation), `GTS_SYNC_KEY` (optional forced passcode), `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET`, `SF_API_VERSION`, `SF_CASE_ORIGIN`, `SF_CASE_RECORD_TYPE_ID`, `SF_CASE_FIELDS_JSON`, `CRON_SECRET` |
| In the app (synced) | Management → System. Export it as JSON (no PIN, no customer data) and import it at another store. |
| Per device | theme (dark / light / matrix), RGB mode, 3D effects level, sounds, tech, team passcode |

## 5. Integrations

* **Webhook payload** (`ticket.create`, `ticket.done`, `assignment.create`):
  ```json
  { "event": "ticket.done", "store": "NYC-SS", "station": "GTS Counter", "at": "…", "app": "gts-hub@4.0.0",
    "ticket": { "id": "…", "tag": "SF-0466", "orderNumber": "1095847721", "customer": "…", "serviceType": "camera",
                "serviceLabel": "Camera", "tech": "Isaiah", "createdAt": "…", "serviceStartedAt": "…",
                "serviceEndedAt": "…", "serviceMinutes": 12.4, "warrantyBrand": null } }
  ```
  Slack, Teams and Azure Logic Apps URLs also receive a `text` summary.
* **Salesforce.** Needs a Connected App with the client-credentials flow and a run-as user who can create Cases. The field mapping is in `lib/salesforce-server.js → caseFromTicket`.
* **UNIX.** Today this is a barcode scan bridge (Code 128 on screen, scanned at the WYSE terminal). A real integration needs the UNIX admin to provide an import job or an SSH bridge. The app already records the order number, tech and time it would need.

## 6. Suggested enterprise roadmap

1. **Identity.** Put SSO (Entra ID / Okta) in front of the app, and map roles to the existing tech / manager permissions. This retires the shared passcode and the PIN.
2. **Per-record storage.** Move tickets, assignments, queue and activity into their own tables (Postgres) so many stores fit, with `storeCode` as the partition key (it is already on every webhook).
3. **Real integrations.** Salesforce Case creation through the existing connector; a UNIX order import; push `ticket.done` events into the BI warehouse.
4. **Ops.** Point `/api/health` at uptime monitoring. Set the retention policy (Management → System → Privacy). Lock down CORS, and keep the URL internal or behind SSO.
5. **Kiosk.** Put the Quick Log stage's *Customer display* mode on a second, customer-facing monitor at each counter.

## 7. Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (CI)
```
No test runner is configured yet. The service-clock and stats maths were checked with a node script during V4: start, pause, resume, finish, resume after done, store hours, customers per open hour, per-tech averages, merge defaults. Adding Vitest around `lib/service.js` and `lib/stats.js` is the obvious first step.
