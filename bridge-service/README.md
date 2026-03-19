# Bridge Service

A bridge service that syncs Postman Monitor run results to Jira Xray.

## Quick Start

```bash
# 1. Clone and configure
git clone <repo>
cd bridge-service
cp .env.example .env
# Edit .env with your credentials (see Configuration below)

# 2. Start (bridge service + database)
docker-compose up -d

# 3. Verify
curl http://localhost:3003/health

# 4. Trigger a sync
curl -X POST http://localhost:3003/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "your-workspace-id"}'
```

Database tables are created automatically on startup.

---

## Prerequisites

- Docker and Docker Compose
- Xray Cloud API credentials
- Postman API key

---

## Configuration

Copy `.env.example` to `.env` and configure:

### Required

```bash
# Xray Cloud (Jira > Apps > Xray > API Keys)
XRAY_CLIENT_ID=your-xray-client-id
XRAY_CLIENT_SECRET=your-xray-client-secret

# Postman API (postman.co/settings/me/api-keys)
POSTMAN_API_URL=https://api.getpostman.com
PM_API_KEY=PMAK-xxxxxxxx
POSTMAN_WORKSPACE_IDS=your-workspace-id

# PostgreSQL
POSTGRES_USER=xray
POSTGRES_PASSWORD=xray
POSTGRES_DB=xray_bridge
DATABASE_URL=postgresql://xray:xray@localhost:5432/xray_bridge
```

### Optional

```bash
SYNC_BASE_TIME=2026-01-01T00:00:00Z  # Only sync runs after this time
SYNC_ENABLED=false                    # Auto-start scheduler
SYNC_CRON=0 * * * *                   # Cron expression (every hour)
PORT=3003
```

#### Cron expression format

```
┌───────── minute (0-59)
│ ┌───────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌───────── month (1-12)
│ │ │ │ ┌───────── day of week (0-7, where 0 and 7 are Sunday)
│ │ │ │ │
* * * * *
```

| Schedule | Expression |
|----------|------------|
| Every hour | `0 * * * *` |
| Every 30 minutes | `*/30 * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Once a day at midnight | `0 0 * * *` |

### How it connects

All monitor data is fetched via the Postman public API using `PM_API_KEY`:
- `GET /monitors?collectionUid=xxx` - list monitors
- `GET /monitors/:monitorId/executions` - list executions (cursor-paginated)
- `GET /monitors/:monitorId/executions/:executionId/runs` - list runs
- `GET /monitors/:monitorId/runs/:runId/results` - get run results

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sync/run` | Sync monitor runs to Xray |
| `POST` | `/sync/junit` | Upload JUnit XML to Xray |
| `GET` | `/health` | Service health check |
| `GET` | `/scheduler/status` | Scheduler and sync state |
| `POST` | `/scheduler/start` | Start cron scheduler |
| `POST` | `/scheduler/stop` | Stop cron scheduler |

---

## Deployment

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for:
- **Option A**: Docker Compose on EC2 (quick setup)
- **Option B**: ECS Fargate + RDS via CloudFormation (production-grade)

---

## Docker

```bash
# Start everything
docker-compose up -d

# View logs
docker logs -f bridge-service

# Rebuild after code changes
docker-compose down && docker-compose up -d --build

# Stop everything (keeps data)
docker-compose down

# Stop and delete database data
docker-compose down -v
```

---

## Collection Setup

### Link Collection to Xray Test Plan

Add a `test-plan-id` variable to your Postman collection:

| Variable | Value |
|----------|-------|
| `test-plan-id` | `PF-123` |

### Folder Naming Convention

Name folders with Xray test key prefixes. Nested folders are supported -- the service walks the full collection tree.

```
PF-1 | Login API Tests
  Setup - Create User
  Login Request
  Verify Token
PF-2 | Create Order Tests
  Setup - Login
  Create Order
  Verify Order
```

---

## Development

```bash
# Stop Docker containers first
docker-compose down

# Start database only
docker start bridge-postgres

# Development with auto-reload
npm run dev
```

---

## Testing / Validation

Recommended approach for validating the service in a new environment:

1. **Isolate**: Copy one of your existing collections to a brand new Postman workspace. Set up a clean Jira project/board with Xray.
2. **Configure**: Point the service at the test workspace and Jira project (via `.env`). Add `test-plan-id` to the copied collection.
3. **Run**: Trigger a monitor run, then sync. Verify the test execution appears correctly in Xray.
4. **Expand**: Once validated, adapt the service to sync additional collections/workspaces.

Some of these steps may be automated in the future.

---

## TODO

### Medium
- [ ] Add link back to the monitor in test execution description (needs team slug)
- [ ] Test parallel sync (workspaces, collections, monitors now run via Promise.all)
- [ ] Handle collection updates between monitor run and sync (folderMap may not match if collection changed after run)

### Medium (contd.)
- [ ] Test AWS deployment -- verify Docker Compose on EC2, test CloudFormation stack (ECS + RDS), validate end-to-end sync in deployed environment
- [ ] Test scheduler -- verify cron-based auto-sync works correctly (start, stop, status, multiple workspaces)

### Low
- [ ] Rename files and methods for clarity ("job" is overloaded across scheduler, sync logic, and executions)
- [ ] Extract duplicated transformer helpers (`extractTestKey`, `buildComment`, `buildEvidences`) into shared module
- [ ] Automated testing -- generate test collections with various structures and validate sync output

---

## Changelog

### 2026-03-10

**Xray Output**
- Test execution title now shows collection name, date/time, and region (e.g. "LoanFlow Tests - 2026-03-10 17:00 (us-east)")
- Cleaned up description: removed markdown asterisks, internal run ID, and stale formatting
- Changed "Trigger" label to "Source" in description
- Added region to description for multi-region monitors
- Cleaned up test comment formatting (removed markdown)
- Skip Xray push when 0 tests are mapped (logs warning with guidance)
- Added assertion mapping count log (e.g. "0 of 36 assertion events had no matching test key")

**Bug Fixes**
- Fixed pagination bug: cursor param was silently ignored in `getAllMonitorJobs`
- Fixed duplicate sync: checkpoint now uses job `finishedAt` instead of run `finishedAt`
- Fixed `config.js` default export removal breaking `prisma/client.js`
- DB connectivity check: sync aborts if database is unavailable (prevents untracked duplicate syncing)

**Code Cleanup**
- Deleted dead files: `testResolver.js`, `jiraClient.js`, `mockJsonToXrayJson.js`
- Deleted dead functions: `getCollectionRuns`, `getRunResults`, `replaceTestKeys`, `clearAuthCache`, `resetState`
- Consolidated duplicate fetch helpers (`postmanFetch` shared between clients)
- Removed debug logging (API URLs, keys, Xray payloads)
- Standardized all config imports to named imports
- Replaced `import *` with named imports in sync job
- Moved `buildFolderMap` to where it's used, made it recursive for nested folders
- Inlined `getTestPlanId` (removed unnecessary utility)
- Removed dead code checks, stale TODOs, unused imports
- Simplified sync controller (3 methods to 1, removed Jira resolution)
- Removed `/health/xray` endpoint
- Fixed redundant ternary in transformers
- Fixed `fs.readFileSync` to async `fs.readFile`
- Standardized `extractTestKey` regex across all transformers
- Removed outdated `scripts/commands.sh`

**Error Handling**
- All Prisma/DB calls wrapped in try/catch (sync state is best-effort)
- `xrayClient` now throws `XrayApiError` for proper error classification
- Removed fragile string-matching error detection

**Infrastructure**
- Dockerized: Dockerfile, docker-compose (bridge + Postgres), auto DB migration on startup
- CloudFormation template for ECS Fargate + RDS deployment
- Deployment guide with EC2 and ECS options
- Parallelized sync across workspaces, collections, and monitors
- Support for multiple workspace IDs in sync endpoint
- Cleaned up `.env` and `.env.example`

### 2026-03-09

**API Gateway (Janus)**
- Exposed 3 monitor run endpoints via Janus gateway
- Cursor-based pagination for executions
- Lua response transforms: flatten status to state, strip internal fields, trim run logs
- Switched bridge from internal API to public Postman API endpoints

---

## License

MIT
