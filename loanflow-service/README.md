# LoanFlow Service

A demo Loan Origination API for testing Postman-Xray integration.

## Overview

This service simulates a loan origination workflow, providing endpoints to test with Postman and sync results to Xray.

### Capabilities

- **Loans**: Create, modify, cancel, and review loans
- **Projects**: Link projects with TPO (Third Party Originator) information to loans
- **State Machine**: Enforces valid loan status transitions

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: SQLite (via better-sqlite3)
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+

### Installation

```bash
cd loanflow-service
npm install
```

### Running the Service

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The service runs on `http://localhost:3000` by default.

### Exposing via ngrok

To make the service accessible for remote testing:

```bash
ngrok http 3000
```

## API Endpoints

### Loans

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/loans` | Create a new loan |
| `GET` | `/loans` | List all loans |
| `GET` | `/loans/:loanId` | Get loan details |
| `POST` | `/loans/:loanId/change-order` | Submit a change order |
| `POST` | `/loans/:loanId/cancel` | Cancel a loan |
| `POST` | `/loans/:loanId/contract-review` | Submit contract review |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects` | Create a new project |
| `GET` | `/projects` | List projects (filter by `?loanId=`) |
| `GET` | `/projects/:projectId` | Get project details |

## Example Requests

### Create a Loan

```bash
curl -X POST http://localhost:3000/loans \
  -H "Content-Type: application/json" \
  -d '{"amount": 250000, "borrowerName": "John Smith"}'
```

**Response:**
```json
{
  "loanId": "LOAN-A1B2C3D4",
  "amount": 250000,
  "borrowerName": "John Smith",
  "status": "ACTIVE",
  "createdAt": "2025-01-22T10:00:00.000Z"
}
```

### Submit Change Order

```bash
curl -X POST http://localhost:3000/loans/LOAN-A1B2C3D4/change-order \
  -H "Content-Type: application/json" \
  -d '{"newAmount": 275000}'
```

### Cancel a Loan

```bash
curl -X POST http://localhost:3000/loans/LOAN-A1B2C3D4/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason": "Borrower withdrew application"}'
```

### Contract Review

```bash
# Approve
curl -X POST http://localhost:3000/loans/LOAN-A1B2C3D4/contract-review \
  -H "Content-Type: application/json" \
  -d '{"decision": "APPROVED", "notes": "All documents verified"}'

# Reject
curl -X POST http://localhost:3000/loans/LOAN-A1B2C3D4/contract-review \
  -H "Content-Type: application/json" \
  -d '{"decision": "REJECTED", "notes": "Missing documentation"}'
```

### Create a Project

```bash
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "loanId": "LOAN-A1B2C3D4",
    "name": "Smith Residence Purchase",
    "tpoInfo": {
      "companyName": "ABC Mortgage Brokers",
      "contactName": "Jane Doe",
      "email": "jane@abcmortgage.com",
      "licenseNumber": "NMLS-12345"
    }
  }'
```

## Loan Status Flow

```
                    ┌──────────────┐
                    │    ACTIVE    │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  CANCELLED   │ │ CPC_REJECTED │ │   (other)    │
    └──────────────┘ └──────────────┘ └──────────────┘
```

| Status | Description | Can Cancel? | Can Change Order? |
|--------|-------------|-------------|-------------------|
| `ACTIVE` | Loan is active | Yes | Yes |
| `CANCELLED` | Loan cancelled | No (409) | No (409) |
| `CPC_REJECTED` | Contract review rejected | No (409) | No (409) |

## Error Handling

All errors return JSON:

```json
{
  "error": "Error message",
  "details": [...]  // Optional validation details
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Validation error |
| `404` | Resource not found |
| `409` | Conflict (invalid state transition) |
| `500` | Internal server error |

## Data Storage

Data is stored in SQLite at `data/loans.db`. The database is created automatically on first run.

To reset the database:
```bash
rm -rf data/loans.db
npm start
```

## Test Collections

Postman collections are available in `collections/`:

- `loanflow-api.postman_collection.json` - Basic API requests
- `loanflow-tests.postman_collection.json` - Full test suite with assertions
- `PF_loantests_collection.json` - Tests mapped to Jira Xray

## License

MIT
