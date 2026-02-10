# Architecture

This document describes the architecture, directory structure, and code flow of the postman-xray-bridge service.

---

## Overview

The service syncs Postman Monitor run results to Jira Xray. It fetches run data from the internal Monitor API (newman-remote-api), transforms it to Xray format, and pushes it to Xray Cloud.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Postman API    │     │  Monitor API    │     │   Xray Cloud    │
│  (collections)  │     │ (newman-remote) │     │   (results)     │
└────────┬────────┘     └────────┬────────┘     └────────▲────────┘
         │                       │                       │
         └───────────┬───────────┘                       │
                     │                                   │
              ┌──────▼──────┐                           │
              │   Bridge    │───────────────────────────┘
              │   Service   │
              └─────────────┘
```

---

## Directory Structure

```
postman-xray-bridge/
├── prisma/
│   ├── schema.prisma         # Database schema (SyncState, SyncJob, SyncRun)
│   └── client.js             # Singleton Prisma client instance
│
├── src/
│   ├── server.js             # Express app entry point
│   ├── config.js             # Environment configuration
│   ├── scheduler.js          # Cron scheduler (node-cron)
│   │
│   ├── routes/
│   │   └── index.js          # HTTP route definitions
│   │
│   ├── controllers/          # HTTP request handlers
│   │   ├── syncController.js # POST /sync/run, /sync/junit
│   │   └── jobsController.js # Scheduler endpoints
│   │
│   ├── services/             # Business logic orchestration
│   │   └── syncService.js    # Main sync orchestration
│   │
│   ├── jobs/                 # Worker jobs
│   │   └── syncMonitorRunsJob.js  # Sync monitor runs to Xray
│   │
│   ├── clients/              # External API clients
│   │   ├── postmanClient.js  # Postman API (collections)
│   │   ├── monitorClient.js  # Monitor API (newman-remote-api)
│   │   ├── xrayClient.js     # Xray Cloud API
│   │   └── jiraClient.js     # Jira REST API
│   │
│   ├── transformers/         # Data transformation
│   │   ├── monitorResultToXrayJson.js  # Monitor run → Xray JSON
│   │   └── junitToXrayXml.js           # JUnit XML → Xray XML
│   │
│   ├── store/                # Database access
│   │   └── syncState.js      # Sync state queries (uses prisma/client.js)
│   │
│   ├── utils/
│   │   ├── retry.js          # Retry helper
│   │   └── testResolver.js   # Jira test key resolution
│   │
│   └── middleware/
│       ├── errorHandler.js   # Error handling
│       ├── logging.js        # Request logging
│       └── upload.js         # File upload handling
│
├── docker-compose.yml        # PostgreSQL container
├── .env.example              # Environment template
└── package.json
```

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  1. CONTROLLERS                                              │
│     HTTP request handlers                                    │
│     Entry point for API requests                             │
├─────────────────────────────────────────────────────────────┤
│  2. SERVICES                                                 │
│     Business logic orchestration                             │
│     Called by controllers AND scheduler                      │
├─────────────────────────────────────────────────────────────┤
│  3. JOBS                                                     │
│     Focused workers for specific tasks                       │
│     Called by services                                       │
├─────────────────────────────────────────────────────────────┤
│  4. CLIENTS                                                  │
│     External API clients                                     │
│     Called by jobs                                           │
├─────────────────────────────────────────────────────────────┤
│  5. DATA LAYER                                               │
│     Prisma (database), Transformers (data shaping)           │
│     Called by jobs                                           │
└─────────────────────────────────────────────────────────────┘
```

### Flow Direction

```
Route → Controller → Service → Job → Clients + Prisma + Transformers
```

**Important:** Flow is one-directional. Jobs do NOT call back to services.

---

## Sync Flow

### Entry Points

```
┌─────────────────┐     ┌─────────────────┐
│   HTTP Request  │     │   Cron Trigger  │
│  POST /sync/run │     │  (scheduler.js) │
└────────┬────────┘     └────────┬────────┘
         │                       │
    Controller              scheduler.runNow()
         │                       │
         └───────────┬───────────┘
                     │
              syncService.syncRuns()
```

### Detailed Flow

```
1. syncService.syncRuns({ workspaceId })
   │
   ├── Get Xray-linked collections (postmanClient)
   │   └── Filter collections with test-plan-id variable
   │
   └── For each collection:
       │
       └── syncMonitorRunsJob.syncCollectionMonitors()
           │
           ├── Get monitors for collection (monitorClient)
           │
           └── For each monitor:
               │
               ├── Get lastSyncedTimestamp (prisma)
               ├── Get jobs since timestamp (monitorClient)
               │
               └── For each job:
                   │
                   └── For each run:
                       │
                       ├── Get run summary (monitorClient)
                       ├── Transform to Xray format (transformer)
                       ├── Push to Xray (xrayClient)
                       └── Update sync state (prisma)
```

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│  SyncState                                                   │
│  ─────────                                                   │
│  Tracks last synced run per source (monitor/collection)      │
│                                                              │
│  PK: (sourceId, sourceType)                                  │
│  Fields: sourceName, testPlanKey, lastRunId, lastRunTimestamp│
├─────────────────────────────────────────────────────────────┤
│  SyncJob                                                     │
│  ───────                                                     │
│  Audit log of each sync job execution                        │
│                                                              │
│  PK: id (auto-increment)                                     │
│  Fields: status, runsTotal, runsSuccess, runsFailed          │
├─────────────────────────────────────────────────────────────┤
│  SyncRun                                                     │
│  ───────                                                     │
│  Individual runs synced within a job                         │
│                                                              │
│  PK: id (auto-increment)                                     │
│  FK: jobId → SyncJob                                         │
│  Fields: sourceId, sourceType, runId, status, xrayExecKey    │
└─────────────────────────────────────────────────────────────┘
```

---

## Scheduler

The cron scheduler runs periodic syncs:

```
┌─────────────────┐
│  server.js      │
│  (on startup)   │
└────────┬────────┘
         │ if SYNC_ENABLED
         ▼
┌─────────────────┐
│  scheduler.js   │
│  startScheduler │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     cron fires      ┌─────────────────┐
│   node-cron     │────────────────────▶│ syncService     │
│   (0 * * * *)   │                     │ .syncRuns()     │
└─────────────────┘                     └─────────────────┘
```

**Managing scheduler via API:**
- `POST /scheduler/start` - Start with custom cron
- `POST /scheduler/stop` - Stop scheduler
- `GET /scheduler/status` - Check status

---

## Error Handling

### Run Sync Failures

When a run fails to sync:
1. Error is logged
2. `SyncRun` record created with `status: 'error'`
3. `lastSyncedTimestamp` is NOT updated
4. Continues processing remaining runs
5. Failed runs can be retried later

### Job Status

| Status | Meaning |
|--------|---------|
| `running` | Job in progress |
| `success` | All runs synced |
| `partial` | Some runs failed |
| `failed` | All runs failed |

---

## Adding New Features

### Adding a New Sync Source (e.g., Collection Runs)

1. Create client: `clients/collectionRunClient.js`
2. Create transformer: `transformers/collectionRunToXrayJson.js`
3. Create job: `jobs/syncCollectionRunsJob.js`
4. Update service: Call new job from `syncService.js`
5. Update `SyncState` calls with `sourceType: 'collection_run'`

### Adding a New Endpoint

1. Add route in `routes/index.js`
2. Create controller method in `controllers/`
3. Create service method in `services/`
4. Create job if needed in `jobs/`

---

## Environment Variables

See `.env.example` for all configuration options.

Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `XRAY_CLIENT_ID` | Yes | Xray Cloud API client ID |
| `XRAY_CLIENT_SECRET` | Yes | Xray Cloud API secret |
| `PM_API_KEY` | Yes | Postman API key |
| `NEWMAN_REMOTE_API_URL` | Yes | Monitor API (newman-remote-api) URL |
| `X_ACCESS_TOKEN` | Yes | Auth token for Monitor API |
| `SYNC_BASE_TIME` | No | Only sync runs after this time |
| `DRY_RUN` | No | Push to Xray but skip DB updates |
