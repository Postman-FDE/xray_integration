# Architecture

How `postman-xray-bridge` is wired together: directory layout, request and
sync flows, persistence, scheduler, and parallelism guarantees.

---

## Overview

The bridge pulls **Postman Monitor** run results from the **Postman public
API** and pushes them as **Test Executions** into **Jira Xray**. It can also
accept a **JUnit XML** upload and forward that directly to Xray.

```
┌──────────────────┐       ┌─────────────────┐
│   Postman API    │       │   Xray Cloud    │
│ (api.getpostman) │       │      API        │
└────────▲─────────┘       └────────▲────────┘
         │                          │
         │   collections / monitors │  POST /api/v2/import/execution
         │   /executions / runs     │  POST /api/v2/import/execution/junit
         │                          │
       ┌─┴────── Bridge Service ────┴─┐
       │  Express + Postgres (Prisma) │
       │  cron + on-demand HTTP       │
       └──────────────────────────────┘
```

There is **no internal/private Postman API** in the data path. Authentication
to Postman is via `PM_API_KEY`; authentication to Xray Cloud is via
`XRAY_CLIENT_ID` + `XRAY_CLIENT_SECRET` (exchanged for a short-lived bearer).

---

## Directory layout

```
bridge-service/
├── prisma/
│   ├── schema.prisma                  # SyncState, SyncJob, SyncRun
│   ├── migrations/                    # See `prisma db push` note in README
│   └── client.js                      # Singleton Prisma client
│
├── src/
│   ├── server.js                      # Express bootstrap, scheduler boot
│   ├── config.js                      # Env-driven config + validateConfig()
│   ├── scheduler.js                   # node-cron + immediate run-on-start
│   │
│   ├── routes/
│   │   └── index.js                   # All HTTP routes
│   │
│   ├── controllers/
│   │   ├── sync.controller.js         # POST /sync/run, /sync/junit
│   │   └── jobsController.js          # /scheduler/status|start|stop
│   │
│   ├── services/
│   │   └── sync.service.js            # Orchestration: workspaces -> collections
│   │
│   ├── jobs/
│   │   └── syncMonitorRuns.job.js     # Per-collection: monitors -> runs -> Xray
│   │
│   ├── clients/
│   │   ├── postmanClient.js           # Workspaces & collections
│   │   ├── monitorClient.js           # Monitors, executions, runs (Postman API)
│   │   └── xrayClient.js              # Xray Cloud auth + import
│   │
│   ├── transformers/
│   │   ├── monitorJsonToXrayJson.js   # Monitor run log -> Xray JSON payload
│   │   └── junitToXrayXml.js          # Postman JUnit XML -> tagged Xray XML
│   │
│   ├── store/
│   │   └── syncState.js               # Sync state / job / run persistence
│   │
│   ├── utils/
│   │   └── retry.js                   # Exponential backoff (skips 4xx)
│   │
│   └── middleware/
│       ├── auth.js                    # Bearer-token gate (BRIDGE_TRIGGER_SECRET)
│       ├── rateLimit.js               # Per-IP cap on mutating routes
│       ├── upload.js                  # Multer for /sync/junit
│       ├── logging.js                 # Request log
│       └── errorHandler.js            # ApiError / XrayApiError -> JSON response
│
├── infra/cloudformation.yml           # Reference ECS Fargate + RDS stack
├── docker-compose.yml                 # Local: bridge + Postgres
├── docs/                              # Setup + deployment guides
└── examples/github-actions/           # Sample workflow_dispatch trigger
```

---

## Layered call flow

```
Route ─▶ Controller ─▶ Service ─▶ Job ─▶ Clients + Prisma + Transformers
```

One direction. Jobs do **not** call services; transformers do not perform
I/O; clients do not depend on database state. The DB layer
(`store/syncState.js`) is **best-effort** -- every call is wrapped in
try/catch so a database hiccup does not crash a sync, except in one place
(see "Crash safety" below).

---

## HTTP entry points

| Method | Path                 | Auth   | Purpose                                  |
|--------|----------------------|--------|------------------------------------------|
| GET    | `/health`            | none   | Liveness probe (process is up)           |
| GET    | `/ready`             | none   | Readiness probe (process up + DB reachable, 2s timeout) |
| POST   | `/sync/run`          | bearer | Sync monitor runs to Xray                |
| POST   | `/sync/junit`        | bearer | Upload JUnit XML (multipart) to Xray     |
| GET    | `/scheduler/status`  | bearer | Cron + sync-state snapshot               |
| POST   | `/scheduler/start`   | bearer | Start the cron loop                      |
| POST   | `/scheduler/stop`    | bearer | Stop the cron loop                       |

All `bearer` routes share the same middleware chain in `routes/index.js`:

```
triggerRateLimit ─▶ requireBridgeSecret ─▶ [uploadXml for /sync/junit] ─▶ controller
```

`triggerRateLimit` runs first so unauthenticated brute-force attempts also
count against the bucket. See `src/middleware/auth.js` and
`src/middleware/rateLimit.js` for details.

---

## Monitor sync flow (`POST /sync/run` and cron)

Both entry points end in `services/sync.service.js#syncRuns`. Both fan out
across workspaces in parallel (`Promise.all`).

```
syncRuns({ workspaceId })
│
├── createSyncJob()                       # Postgres row; abort if DB unavailable
│
├── postmanClient.getCollectionsWithVariables(workspaceId)
│       fetches every collection in the workspace, then loads
│       each collection's variables + items in parallel
│
├── filterXrayLinkedCollections()         # keep collections with `test-plan-id` var
│
└── Promise.all(xrayCollections.map(c =>
      syncMonitorRunsJob.syncCollectionMonitors({ collection: c, jobId })))
        │
        ├── buildFolderMap(collection)    # request-id -> folder name with test key
        ├── monitorClient.getMonitors({ collectionId })
        │
        └── Promise.all(monitors.map(m => syncSingleMonitor(...)))
                │
                ├── getLastSyncedTimestamp(monitorId, 'monitor')
                ├── effectiveSince = max(SYNC_BASE_TIME, lastSynced)
                ├── monitorClient.getAllMonitorJobs(monitorId, { sinceTimestamp })
                │       cursor-paginated, sorted oldest-first so checkpoints
                │       advance monotonically
                │
                └── for each job (sequential):
                        for each run (sequential):
                            ├── monitorClient.getRunLog(monitorId, runId)
                            ├── monitorJsonToXrayJson.transformToXrayJson(...)
                            │
                            ├── if 0 mapped tests -> skip + log warning
                            │
                            ├── xrayClient.importXrayJson(payload)  (with retry)
                            └── updateLastSynced(...) + recordSyncRun(...)
```

### Test-key mapping

Tests in Xray are matched by **issue key** (`PF-52`, `LOAN-3`, etc.). The
bridge derives the key from the **collection folder name** containing the
request, with the convention:

```
PF-52 | Create Loan
   └─ regex: /^([A-Z]+-\d+)\s*\|/
```

`buildFolderMap` walks the collection tree (nested folders supported) and
produces `requestId -> folderName`. The transformer reads the **assertion
events** out of the run log, ties each assertion back to a request via the
`beforeItem` event's cursor ref, looks up the folder name, and groups
assertions per test key. Requests without a matching test key are dropped
with a log line; if no tests at all are mapped for a run, the bridge
**skips the Xray push entirely** rather than push an empty execution.

### Checkpoint semantics

The "last synced" timestamp uses the **job's** `finishedAt` (with fallbacks
to the run's `finishedAt` and now), not the run's, because a single
execution can produce multiple runs in regional monitors and we want a
monotonic high-watermark per monitor. On retry, a duplicate run will be
**re-pushed to Xray** -- Xray's `import/execution` endpoint creates a new
test execution each time. We don't currently dedupe; if the customer
re-triggers a sync after a partial failure, expect duplicate executions for
the runs that succeeded.

---

## JUnit upload flow (`POST /sync/junit`)

Independent of the monitor flow. Multer writes the upload to a temp file;
the controller reads it, calls `transformJUnitXml` to inject `test_key`
properties from testsuite names, and posts to Xray's
`/api/v2/import/execution/junit` (with optional query params for project,
test plan, test execution, environments, revision). Temp file is cleaned up
on both success and error paths.

---

## Persistence

Postgres via Prisma; schema in `prisma/schema.prisma`.

| Table        | Role                                                  |
|--------------|-------------------------------------------------------|
| `sync_state` | One row per `(sourceId, sourceType)` -- last run id + timestamp + test plan key. Used as the per-monitor checkpoint. |
| `sync_jobs`  | One row per top-level sync invocation. Status: `running` / `success` / `partial` / `failed`. |
| `sync_runs`  | One row per individual run sync attempt within a job. Stores Xray exec key on success or error message on failure. |

> The `prisma/migrations/` directory currently contains a stale init that
> does **not** match the live schema. The Dockerfile uses `prisma db push`
> which generates the schema directly from `schema.prisma` and bypasses
> migrations -- this is the supported path. See README for context.

### Crash safety

`syncRuns` calls `createSyncJob()` first and aborts the entire sync if it
returns `null` (DB unavailable). This is intentional: without a job row we
cannot record which runs synced, and a successful Xray push followed by a
crash before checkpointing would silently re-sync the same run on the next
tick. Failing closed up front is preferable.

Other DB writes (checkpoint update, per-run record, job completion) are
best-effort -- they log on failure but do not interrupt processing. Worst
case: the next sync tick re-pushes runs that were already in Xray.

---

## Scheduler

`src/scheduler.js` wraps `node-cron`. Behavior:

- On bridge startup, if `SYNC_ENABLED=true` and `POSTMAN_WORKSPACE_IDS` is
  non-empty, the scheduler is started automatically.
- Starting the scheduler runs an **immediate sync** before the first cron
  fire.
- The cron callback iterates workspaces **sequentially** (HTTP path
  parallelizes them).
- `POST /scheduler/start|stop|status` provide runtime control without a
  redeploy.

The cron cadence comes from `SYNC_CRON` (default `0 * * * *`, hourly).

---

## Parallelism, in practice

| Level                  | Behavior      | Where                                         |
|------------------------|---------------|-----------------------------------------------|
| Workspaces             | parallel      | `controllers/sync.controller.js`, `scheduler.js#runNow` |
| Collections / workspace| parallel      | `services/sync.service.js`                    |
| Monitors / collection  | parallel      | `jobs/syncMonitorRuns.job.js`                 |
| Jobs / monitor         | **sequential**| `jobs/syncMonitorRuns.job.js`                 |
| Runs / job             | **sequential**| `jobs/syncMonitorRuns.job.js`                 |

The lower two levels are sequential on purpose: pushing runs in monotonic
finish-time order means the checkpoint always advances safely. Going
parallel there is possible but requires careful checkpoint accounting on
partial failure.

---

## External APIs called

| API                          | Endpoint(s) used                                                                                                         | Auth                            |
|------------------------------|--------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| Postman                      | `GET /collections?workspace=...`, `GET /collections/:uid`, `GET /monitors?collectionUid=...`, `GET /monitors/:id/executions[?cursor=...]`, `GET /monitors/:mid/executions/:eid/runs`, `GET /monitors/:mid/runs/:rid/results` | `X-Api-Key: PM_API_KEY` |
| Xray Cloud                   | `POST /api/v2/authenticate`, `POST /api/v2/import/execution`, `POST /api/v2/import/execution/junit`                       | client-credentials -> bearer    |

The Xray bearer is cached in-process for ~55 minutes; `authenticate()`
returns the cached token until it nears expiry.

---

## Inbound auth + rate limiting

See `src/middleware/auth.js` and `src/middleware/rateLimit.js`. Summary:

- All mutating routes plus `GET /scheduler/status` require
  `Authorization: Bearer <BRIDGE_TRIGGER_SECRET>`.
- Without a configured secret, those routes return **503**. The bridge
  itself still starts; cron continues to run.
- `BRIDGE_TRIGGER_SECRET_PREVIOUS` is accepted alongside the current secret
  during rotation.
- Comparison is constant-time (SHA-256 + `crypto.timingSafeEqual`).
- Per-IP rate limit: 10 req/min on protected routes. The cron path bypasses
  HTTP and is unaffected.
- The bridge sets `app.set('trust proxy', 1)` so `X-Forwarded-For` from a
  single upstream proxy (LB / CloudFront) is honored. Adjust if you stack
  multiple proxies.

---

## Configuration surface

All env-driven; defined in `src/config.js`. The required set:

| Variable                     | Purpose                                                  |
|------------------------------|----------------------------------------------------------|
| `DATABASE_URL`               | Postgres connection                                       |
| `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` | Xray Cloud client credentials                  |
| `PM_API_KEY`                 | Postman API key                                          |
| `BRIDGE_TRIGGER_SECRET`      | Inbound bearer for protected routes                      |

The optional set is documented at the top of `src/config.js` and in
`.env.example`.
