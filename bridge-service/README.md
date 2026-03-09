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

### How it connects

All monitor data is fetched via the Postman public API using `PM_API_KEY`:
- `GET /monitors?collectionUid=xxx` - list monitors
- `GET /monitors/:monitorId/executions` - list executions (cursor-paginated)
- `GET /monitors/:monitorId/executions/:executionId/runs` - list runs
- `GET /monitors/:monitorId/runs/:runId/results` - get run results

---

## API Endpoints

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sync/run` | Sync monitor runs to Xray |
| `POST` | `/sync/junit` | Upload JUnit XML to Xray |

### Scheduler

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/scheduler/status` | Get scheduler and sync state |
| `POST` | `/scheduler/start` | Start the cron scheduler |
| `POST` | `/scheduler/stop` | Stop the cron scheduler |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/health/xray` | Xray connection check |

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

Name folders with Xray test key prefixes:

```
PF-1 | Login API Tests
PF-2 | Create Order Tests
PF-3 | Payment Flow Tests
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

### High
- [ ] Create Dockerfile for the bridge service -- DONE
- [ ] Remove debug logging -- DONE
- [ ] Clean up `.env` -- DONE
- [ ] Fix duplicate sync bug -- DONE

### Medium
- [ ] Sanitize Xray/Jira output - review what's written to test execution issues and clean up to only include what's useful
- [ ] Edge case handling - collections/monitors that fall outside our implementation (e.g. no test keys, empty runs, multi-region monitors, large log payloads)
- [ ] Better error handling for Prisma/DB failures
- [ ] Fix shutdown handlers in `server.js` - async but not awaited

### Low
- [ ] Remove unused transformers (`monitorResultToXrayJson.js`, `mockJsonToXrayJson.js`)
- [ ] Clean up TODO comments across codebase
- [ ] Remove outdated `scripts/commands.sh`
- [ ] Consolidate duplicate sync controller methods (`syncJunit` vs `syncJunitRaw`)

---

## License

MIT
