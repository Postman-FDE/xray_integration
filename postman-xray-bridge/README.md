# Postman-Xray-Bridge

A bridge service that syncs Postman Monitor run results to Jira Xray.

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd postman-xray-bridge
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your credentials (see Configuration below)

# 3. Start database
docker-compose up -d

# 4. Initialize database
npx prisma db push
npx prisma generate

# 5. Start service
npm run dev
```

Service runs at `http://localhost:3003`

---

## Prerequisites

- Node.js 18+ (Node.js 24+ recommended for native TypeScript)
- Docker (for PostgreSQL)
- Xray Cloud API credentials
- Postman API key

---

## Configuration

Copy `.env.example` to `.env` and configure:

### Required

```bash
# Database (used by docker-compose)
POSTGRES_USER=xray
POSTGRES_PASSWORD=xray
POSTGRES_DB=xray_bridge
DATABASE_URL=postgresql://xray:xray@localhost:5432/xray_bridge

# Xray Cloud (get from: Jira → Apps → Xray → API Keys)
XRAY_CLIENT_ID=your-client-id
XRAY_CLIENT_SECRET=your-client-secret

# Postman API (get from: postman.co/settings/me/api-keys)
PM_API_KEY=PMAK-xxxxxxxx
POSTMAN_WORKSPACE_IDS=your-workspace-id

# Monitor API (newman-remote-api)
NEWMAN_REMOTE_API_URL=http://localhost:8080
X_ACCESS_TOKEN=your-monitor-api-access-token
```

### Optional

```bash
# Sync settings
SYNC_ENABLED=false           # Auto-start scheduler
SYNC_CRON=0 * * * *          # Cron expression (every hour)
SYNC_BASE_TIME=2026-01-01T00:00:00Z  # Only sync runs after this time
DRY_RUN=false                # Push to Xray but skip DB updates

# Server
PORT=3003
```

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

## Usage

### Manual Sync

```bash
# Sync all monitors in a workspace
curl -X POST http://localhost:3003/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceId": "your-workspace-id"}'

# Sync specific monitor
curl -X POST http://localhost:3003/sync/run \
  -H "Content-Type: application/json" \
  -d '{"monitorId": "your-monitor-id"}'
```

### Scheduled Sync

```bash
# Start scheduler
curl -X POST http://localhost:3003/scheduler/start \
  -H "Content-Type: application/json" \
  -d '{"workspaceIds": ["ws-id-1"], "cronExpression": "0 * * * *"}'

# Check status
curl http://localhost:3003/scheduler/status

# Stop scheduler
curl -X POST http://localhost:3003/scheduler/stop
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
# Development with auto-reload
npm run dev

# Debug mode (with inspector)
npm run debug

# Production
npm start
```

### Database Commands

```bash
# View database in browser
npx prisma studio

# Reset database (drops all data)
npx prisma db push --force-reset

# Regenerate Prisma client
npx prisma generate
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation on:
- Directory structure
- Code flow diagrams
- Layer responsibilities

---

## License

MIT
