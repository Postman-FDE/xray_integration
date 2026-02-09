# Postman-Xray Integration

Automated syncing of Postman test results to Jira Xray with automatic test issue creation.

## Features

- **Two sync modes:**
  - Manual: Upload JUnit XML from Newman CLI
  - Automated: Fetch past collection runs via mock API and sync JSON
- **Auto-create Jira Tests** when they don't exist
- **State tracking** to avoid re-syncing runs
- **Scheduled sync** via cron

## Quick Start

### 1. Start Services

**Terminal 1 - LoanFlow API (demo service):**
```bash
cd loanflow-service
npm install
npm start  # Port 3000
```

**Terminal 2 - PostgreSQL (Docker):**
```bash
docker run -d \
  --name xray_bridge_postgres \
  -e POSTGRES_USER=xray \
  -e POSTGRES_PASSWORD=xray \
  -e POSTGRES_DB=xray_bridge \
  -p 5432:5432 \
  postgres:16
```

**Terminal 3 - Xray Bridge:**
```bash
cd postman-xray-bridge
npm install
cp .env.example .env
# Edit .env with your credentials
npx prisma db push  # Initialize database
npm start  # Port 4000
```

### 2. Sync Options

**Option A: Manual sync with Newman**
```bash
# Run tests and export JUnit XML
newman run collection.json -r junit --reporter-junit-export results.xml

# Push to Xray
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=PF" \
  -F "testPlanKey=PF-1"
```

**Option B: Automated sync (via mock API)**
```bash
# Trigger sync job - fetches runs from mock, transforms JSON, pushes to Xray
curl -X POST http://localhost:4000/jobs/sync/run \
  -H "Content-Type: application/json" \
  -d '{"workspaceIds": ["your-workspace-id"]}'
```

### 3. View Results in Jira

Results appear in your Jira Test Execution with PASS/FAIL status.

---

## Project Structure

```
xray_integration/
├── loanflow-service/              # Demo Loan API (port 3000)
│   ├── src/
│   │   ├── controllers/           # Request handlers
│   │   ├── services/              # Business logic & DB
│   │   └── routes/                # API routes
│   └── collections/               # Postman test collections
│
├── postman-xray-bridge/           # Sync service (port 4000)
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── syncController.js  # Manual sync (JUnit XML)
│   │   │   └── jobsController.js  # Automated sync jobs
│   │   ├── services/
│   │   │   ├── xrayService.js     # Xray Cloud API
│   │   │   ├── jiraService.js     # Jira API (create tests)
│   │   │   ├── postmanService.js  # Postman/Mock API client
│   │   │   ├── junitTransformer.js       # XML transformation
│   │   │   └── jsonToXrayTransformer.js  # JSON transformation
│   │   ├── jobs/                  # Scheduled sync
│   │   ├── store/
│   │   │   └── syncState.js       # Sync state (PostgreSQL)
│   │   └── generated/             # Prisma client (auto-generated)
│   └── README.md                  # Detailed docs
│
└── README.md                      # This file
```

---

## Collection Naming Convention

Name your Postman folders with Jira-style prefixes:

```
PF-2 | Change Order Test
PF-3 | Cancel Loan Test
PF-4 | Contract Review Test
```

The bridge will:
1. Search Jira for existing Test issues matching the prefix
2. Create new Test issues if not found
3. Map results to the correct Jira keys

---

## Required Credentials

| Service | Environment Variable | Purpose |
|---------|---------------------|---------|
| PostgreSQL | `DATABASE_URL` | Sync state persistence |
| Xray Cloud | `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET` | Push test results |
| Jira API | `JIRA_EMAIL`, `JIRA_API_TOKEN` | Search/create Test issues |
| Postman | `PM_API_KEY` | Fetch collections |
| Mock API | `POSTMAN_MOCK_URL` | Fetch collection runs (until real API exists) |

---

## Requirements

- Node.js 18+ (Node.js 24+ recommended)
- Docker (for PostgreSQL)
- Xray Cloud API credentials
- Jira project with Xray enabled

---

See individual service READMEs for detailed documentation.
