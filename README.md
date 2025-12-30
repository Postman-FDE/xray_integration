# Postman-Xray Integration

Automated syncing of Postman/Newman test results to Jira Xray.

## Quick Start

### 1. Start Services

**Terminal 1 - API Service:**
```bash
cd loanflow-service
npm install
npm start  # Port 3000
```

**Terminal 2 - Bridge Service:**
```bash
cd postman-xray-bridge
npm install

# Set credentials (copy env.copy to .env and fill in your credentials)
cp ../env.copy ../.env
# Edit .env with your actual credentials

# OR set via environment variables:
export XRAY_CLIENT_ID="your_client_id"
export XRAY_CLIENT_SECRET="your_client_secret"

npm start  # Port 4000
```

### 2. Run Tests & Sync

```bash
# Run tests
newman run PF_loantests_collection.json -r junit --reporter-junit-export results.xml

# Sync to Xray
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=PF" \
  -F "testPlanKey=PF-1"
```

### 3. View Results in Jira

Results appear in your Jira Test Execution with PASS/FAIL status.

---

## Structure

```
postman_xray_integration/
├── loanflow-service/          # Demo API service (port 3000)
│   └── collections/           # Postman collections
└── postman-xray-bridge/       # Sync service (port 4000)
    ├── src/
    │   ├── controllers/       # Request handlers
    │   ├── services/          # Xray API & transformers
    │   └── routes/            # API routes
    └── README.md              # Detailed docs
```

---

## Collection Naming Convention

Name test folders with Jira keys:

```
PF-2 | Change Order Test
PF-3 | Cancel Loan Test
PF-4 | My New Test
```

Xray will map results to these test issues.

---

## Requirements

- Node.js 18+
- Xray Cloud API credentials
- Jira project with Xray enabled
- Description field must be optional (not required)

---

See individual service READMEs for details.

