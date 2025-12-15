# Postman-Xray-Bridge

A bridge service to sync Postman/Newman test results to Jira Xray.

## Overview

This service accepts JUnit XML test results (exported from Newman) and pushes them to Xray Cloud via its REST API.

```
┌─────────────────┐         ┌─────────────────────────┐         ┌─────────────┐
│  Newman CLI     │         │  postman-xray-bridge    │         │  Xray Cloud │
│                 │────────▶│  POST /sync             │────────▶│  API v2     │
│  JUnit XML      │  file   │                         │  JWT    │             │
└─────────────────┘         └─────────────────────────┘         └─────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- Xray Cloud API credentials (client ID and secret)

### Installation

```bash
cd postman-xray-bridge
npm install
```

### Configuration

Set the following environment variables:

```bash
export XRAY_CLIENT_ID=your_client_id
export XRAY_CLIENT_SECRET=your_client_secret
```

To get Xray API credentials:
1. Go to Jira → Apps → Xray
2. Navigate to API Keys
3. Create a new API key pair

### Running the Service

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The service runs on `http://localhost:4000` by default.

## API Endpoints

### POST /sync

Upload a JUnit XML file and sync to Xray.

**Request:**
```bash
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "projectKey=SJP" \
  -F "testPlanKey=SJP-1"
```

**Form Fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | JUnit XML file |
| `projectKey` | No | Jira project key (e.g., 'SJP') |
| `testPlanKey` | No | Test plan issue key (e.g., 'SJP-1') |
| `testExecKey` | No | Existing test execution to update |
| `testEnvironments` | No | Test environment name |

**Response:**
```json
{
  "success": true,
  "message": "Test results synced to Xray successfully",
  "xray": {
    "testExecKey": "SJP-123",
    "testExecId": "12345",
    "testExecSelf": "https://your-jira.atlassian.net/browse/SJP-123"
  }
}
```

### POST /sync/raw

Send raw JUnit XML in the request body.

**Request:**
```bash
curl -X POST "http://localhost:4000/sync/raw?projectKey=SJP&testPlanKey=SJP-1" \
  -H "Content-Type: application/xml" \
  --data-binary @results.xml
```

### GET /sync/status

Check if Xray credentials are configured and valid.

```bash
curl http://localhost:4000/sync/status
```

### GET /health

Health check endpoint.

```bash
curl http://localhost:4000/health
```

## Usage with Newman

1. Run your collection and export JUnit XML:
   ```bash
   newman run collection.json -r junit --reporter-junit-export results.xml
   ```

2. Push results to the bridge:
   ```bash
   curl -X POST http://localhost:4000/sync \
     -F "file=@results.xml" \
     -F "projectKey=SJP" \
     -F "testPlanKey=SJP-1"
   ```

### One-liner

```bash
newman run collection.json -r junit --reporter-junit-export results.xml && \
curl -X POST http://localhost:4000/sync \
  -F "file=@results.xml" \
  -F "testPlanKey=SJP-1"
```

## Exposing with ngrok

To make the service accessible over the internet:

```bash
ngrok http 4000
```

This provides a public URL like `https://abc123.ngrok.io` that you can use from CI/CD pipelines.

## License

MIT

