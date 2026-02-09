# Postman-Xray-Bridge

A bridge service to sync Postman test results to Jira Xray with automatic test issue creation.

## Overview

This service syncs Postman collection run results to Xray Cloud. It supports two modes of operation:

1. **Manual sync** - Upload JUnit XML directly (Newman CLI output)
2. **Automated sync** - Fetch collection runs from Postman (via mock API) and push JSON results to Xray

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNC MODES                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MODE 1: Manual (JUnit XML)                                                 │
│  ────────────────────────────                                               │
│  ┌─────────────┐  JUnit XML   ┌─────────────────┐          ┌─────────────┐  │
│  │  Newman CLI │─────────────▶│  POST /sync     │─────────▶│  Xray Cloud │  │
│  └─────────────┘              └─────────────────┘          └─────────────┘  │
│                                       │                                     │
│                                       ▼ (if projectKey provided)            │
│                               ┌─────────────────┐                           │
│                               │  Jira REST API  │                           │
│                               │  (auto-create)  │                           │
│                               └─────────────────┘                           │
│                                                                             │
│  MODE 2: Automated (JSON via Mock API)                                      │
│  ───────────────────────────────────────                                    │
│  ┌─────────────┐  list runs   ┌─────────────────┐   JSON   ┌─────────────┐  │
│  │  Mock API   │◀────────────▶│  Sync Job       │─────────▶│  Xray Cloud │  │
│  │  (Postman)  │  run results │  /jobs/sync/run │          │             │  │
│  └─────────────┘              └─────────────────┘          └─────────────┘  │
│                                                                             │
│  Note: Auto-create not yet implemented for Mode 2                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **JUnit XML sync** - Upload Newman results directly via `/sync`
- **JSON sync via mock API** - Fetch past collection runs and transform to Xray format
- **Auto-create Jira Tests** - Creates Test issues if they don't exist (JUnit XML mode only)
- **Test Plan resolution** - Auto-resolves Test Plans by collection prefix (JUnit XML mode only)
- **Scheduled sync** - Cron-based automatic synchronization
- **State tracking** - Tracks last synced run per collection to avoid duplicates

## Getting Started

### Prerequisites

- Node.js 18+ (Node.js 24+ recommended for native TypeScript support)
- Docker (for PostgreSQL)
- Xray Cloud API credentials
- Jira API token (optional, for auto-creating tests)

### Installation

```bash
cd postman-xray-bridge
npm install
```

### Database Setup

The service uses PostgreSQL for state persistence. Run PostgreSQL in Docker:

```bash
# Start PostgreSQL container
docker run -d \
  --name xray_bridge_postgres \
  -e POSTGRES_USER=xray \
  -e POSTGRES_PASSWORD=xray \
  -e POSTGRES_DB=xray_bridge \
  -p 5432:5432 \
  postgres:16

# Initialize database schema
npx prisma db push
```

To reset the database (drops all data):
```bash
npx prisma migrate reset
```

### Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env
```

**Required - Database:**
```bash
# PostgreSQL connection (matches Docker container above)
DATABASE_URL=postgresql://xray:xray@localhost:5432/xray_bridge
```

**Required - Xray Cloud:**
```bash
# Get from: Jira → Apps → Xray → API Keys
XRAY_CLIENT_ID=your_client_id
XRAY_CLIENT_SECRET=your_client_secret
```

**Optional - Jira API (for auto-creating tests):**
```bash
# Get token from: https://id.atlassian.com/manage-profile/security/api-tokens
JIRA_EMAIL=your_email@company.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_BASE_URL=https://your-instance.atlassian.net
```

**Optional - Postman (for automated sync jobs):**
```bash
PM_API_KEY=PMAK-xxxxxxxx
POSTMAN_WORKSPACE_IDS=workspace-id-1,workspace-id-2
POSTMAN_MOCK_URL=https://your-mock-id.mock.pstmn.io
```

**Optional - Scheduler:**
```bash
SYNC_ENABLED=false              # Start scheduler on boot
SYNC_CRON=0 * * * *             # Every hour
DRY_RUN=false                   # If true: push to Xray but skip all DB updates
```

### Running the Service

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The service runs on `http://localhost:4000` by default.

---

## API Endpoints

### Manual Sync (JUnit XML)

#### POST /sync

Upload a JUnit XML file (from Newman) and sync to Xray.

```bash
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=PF" \
  -F "testPlanKey=PF-1"
```

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | JUnit XML file |
| `projectKey` | No | Jira project key - enables auto-create |
| `testPlanKey` | No | Test plan issue key (e.g., 'PF-1') |
| `testExecKey` | No | Existing test execution to update |
| `testEnvironments` | No | Test environment name |

#### POST /sync/raw

Send raw JUnit XML in the request body.

```bash
curl -X POST "http://localhost:4000/sync/raw?projectKey=PF" \
  -H "Content-Type: application/xml" \
  --data-binary @results.xml
```

#### POST /sync/preview

Preview the transformed XML without sending to Xray.

```bash
curl -X POST http://localhost:4000/sync/preview \
  -F "file=@results.xml"
```

#### GET /sync/status

Check if Xray credentials are valid.

```bash
curl http://localhost:4000/sync/status
```

---

### Automated Sync Jobs (JSON via Mock API)

The sync job fetches collection runs from a Postman mock server, transforms the JSON results to Xray format, and pushes them.

#### POST /jobs/sync/run

Manually trigger a sync job. Fetches new collection runs since last sync.

```bash
# Sync specific workspace(s)
curl -X POST http://localhost:4000/jobs/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceIds": ["workspace-id-1"]}'

# Sync default workspaces (from POSTMAN_WORKSPACE_IDS)
curl -X POST http://localhost:4000/jobs/sync/run
```

**How it works:**
1. Fetches all collections in the workspace
2. Filters to collections with `test-plan-id` variable (Xray-linked)
3. For each collection, fetches runs from mock API since last sync
4. Transforms JSON results to Xray JSON format
5. Pushes to Xray Cloud
6. Updates sync state

#### GET /jobs/sync/status

Get scheduler status and sync state.

```bash
curl http://localhost:4000/jobs/sync/status
```

**Response:**
```json
{
  "scheduler": {
    "running": false,
    "cronExpression": "0 * * * *",
    "workspaceIds": ["workspace-id-1"]
  },
  "state": {
    "lastRun": "2025-01-21T10:00:00.000Z",
    "collectionsTracked": 2,
    "collections": {
      "12345-abc": {
        "lastRunId": "run-123",
        "lastRunTimestamp": "2025-01-21T09:55:00.000Z"
      }
    }
  },
  "recentJobs": [
    {
      "id": 1,
      "startedAt": "2025-01-21T10:00:00.000Z",
      "endedAt": "2025-01-21T10:00:15.000Z",
      "status": "success",
      "runsTotal": 2,
      "runsSuccess": 2,
      "runsFailed": 0
    }
  ]
}
```

#### POST /jobs/sync/start

Start the scheduler.

```bash
curl -X POST http://localhost:4000/jobs/sync/start \
  -H "Content-Type: application/json" \
  -d '{"workspaceIds": ["ws-id"], "cronExpression": "*/30 * * * *"}'
```

#### POST /jobs/sync/stop

Stop the scheduler.

```bash
curl -X POST http://localhost:4000/jobs/sync/stop
```

#### POST /jobs/sync/reset

Reset all sync state (re-sync from beginning).

```bash
curl -X POST http://localhost:4000/jobs/sync/reset
```

---

### Health Check

```bash
curl http://localhost:4000/health
```

---

## Mock API

The sync job uses a **Postman mock server** to fetch collection runs. This is because the real Postman API doesn't yet expose collection run history endpoints.

**Mock endpoints used:**
- `GET /collections/{uid}/runs` - List runs for a collection
- `GET /collections/{uid}/runs/{runId}` - Get run results

Configure via:
```bash
POSTMAN_MOCK_URL=https://your-mock-id.mock.pstmn.io
```

When the real Postman API adds these endpoints, the mock will be replaced.

---

## Usage Examples

### With Newman CLI

```bash
# Run tests and export JUnit XML
newman run collection.json -r junit --reporter-junit-export results.xml

# Sync to Xray
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=PF" \
  -F "testPlanKey=PF-1"
```

### One-liner

```bash
newman run collection.json -r junit --reporter-junit-export results.xml && \
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=PF"
```

### Automated Sync

```bash
# Trigger sync job for workspace
curl -X POST http://localhost:4000/jobs/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceIds": ["your-workspace-id"]}'
```

---

## Collection Setup for Xray

### Naming Convention

Name your Postman folders with Jira-style prefixes:

```
PF-2 | Change Order API Test
PF-3 | Cancel Loan API Test
PF-4 | Contract Review Test
```

### Collection Variable

Add a `test-plan-id` variable to link the collection to an Xray Test Plan:

| Variable | Value |
|----------|-------|
| `test-plan-id` | `PF-1` |

---

## Exposing with ngrok

```bash
ngrok http 4000
```

---

## Project Structure

```
postman-xray-bridge/
├── prisma/
│   └── schema.prisma              # Database schema definition
├── prisma.config.ts               # Prisma configuration
├── src/
│   ├── config.js                  # Environment configuration
│   ├── server.js                  # Express server
│   ├── generated/
│   │   └── prisma/                # Generated Prisma client (auto-generated)
│   ├── controllers/
│   │   ├── syncController.js      # Manual sync endpoints (JUnit XML)
│   │   └── jobsController.js      # Sync job management
│   ├── services/
│   │   ├── xrayService.js         # Xray Cloud API (JWT auth, import)
│   │   ├── jiraService.js         # Jira REST API (search/create tests)
│   │   ├── testResolver.js        # Test key resolution logic
│   │   └── postmanService.js      # Postman API + mock API client
│   ├── transformers/
│   │   ├── junitToXrayXml.js         # JUnit XML → Xray XML (manual sync)
│   │   └── mockJsonToXrayJson.js     # Mock JSON → Xray JSON (auto sync)
│   ├── jobs/
│   │   ├── scheduler.js           # Cron job scheduler
│   │   └── syncJob.js             # Sync job logic (fetch → transform → push)
│   ├── store/
│   │   └── syncState.js           # Sync state (PostgreSQL via Prisma)
│   └── middleware/
├── collections/                   # API collections for testing
└── test-results/                  # Sample test data
```

## Database Schema

The service tracks sync state across three tables:

| Table | Purpose |
|-------|---------|
| `sync_state` | Last synced run per collection (prevents re-syncing) |
| `sync_jobs` | Audit log of each sync job triggered |
| `sync_runs` | Individual runs synced within each job |

---

## License

MIT
