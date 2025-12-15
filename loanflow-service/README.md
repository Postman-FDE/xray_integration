# LoanFlow Service

A demo Loan Origination API service built for Xray/Postman integration testing.

## Overview

This service simulates a loan origination workflow with the following capabilities:

- **Loans**: Create loans, submit change orders, cancel loans, and process contract reviews
- **Projects**: Create and retrieve projects linked to loans with TPO (Third Party Originator) information

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: SQLite (via better-sqlite3)
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+ recommended

### Installation

```bash
cd loanflow-service
npm install
```

### Running the Service

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The service runs on `http://localhost:3000` by default.

## API Endpoints

### Loans

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/loans` | Create a new loan |
| `GET` | `/loans` | List all loans |
| `GET` | `/loans/:loanId` | Get loan details |
| `POST` | `/loans/:loanId/change-order` | Submit a change order |
| `POST` | `/loans/:loanId/cancel` | Cancel a loan |
| `POST` | `/loans/:loanId/contract-review` | Submit contract review decision |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects` | Create a new project |
| `GET` | `/projects` | List all projects |
| `GET` | `/projects/:projectId` | Get project details (TPO info) |

## Example Requests

### Create a Loan

```bash
curl -X POST http://localhost:3000/loans \
  -H "Content-Type: application/json" \
  -d '{"amount": 250000, "borrowerName": "John Smith"}'
```

### Submit Change Order

```bash
curl -X POST http://localhost:3000/loans/LOAN-XXXXXXXX/change-order \
  -H "Content-Type: application/json" \
  -d '{"newAmount": 275000}'
```

### Cancel a Loan

```bash
curl -X POST http://localhost:3000/loans/LOAN-XXXXXXXX/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason": "Borrower withdrew application"}'
```

### Contract Review

```bash
curl -X POST http://localhost:3000/loans/LOAN-XXXXXXXX/contract-review \
  -H "Content-Type: application/json" \
  -d '{"decision": "APPROVED", "notes": "All documents verified"}'
```

### Create a Project

```bash
curl -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "loanId": "LOAN-XXXXXXXX",
    "name": "Smith Residence Purchase",
    "tpoInfo": {
      "companyName": "ABC Mortgage Brokers",
      "contactName": "Jane Doe",
      "email": "jane@abcmortgage.com",
      "licenseNumber": "MB-12345"
    }
  }'
```

## Loan Statuses

| Status | Description |
|--------|-------------|
| `ACTIVE` | Loan is active and can be modified |
| `CANCELLED` | Loan has been cancelled |
| `CPC_REJECTED` | Contract review was rejected |

## Error Handling

All errors return JSON with the following structure:

```json
{
  "error": "Error message",
  "details": [...]  // Optional validation details
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Validation error
- `404` - Resource not found
- `409` - Conflict (invalid state transition)
- `500` - Internal server error

## Data Storage

Data is stored in SQLite at `data/loans.db`. The database is created automatically on first run.

## License

MIT

