# Postman-Xray Bridge: Setup and Deployment Plan

This service syncs Postman Monitor run results to Jira Xray automatically. Here's the end-to-end setup process.

---

## Phase 1 -- Prerequisites (before anything else)

1. **Postman API Key** -- Generate at https://postman.co/settings/me/api-keys. This is how the bridge authenticates with Postman.
2. **Xray Cloud API Credentials** -- Generate a Client ID + Client Secret from Jira > Apps > Xray > API Keys. Recommended: create these under a service account (e.g. "Postman Bridge Bot") so test executions show the bot as the executor, not a personal account.
3. **Docker** -- Install Docker and Docker Compose on the machine where you'll run the service.

---

## Phase 2 -- Postman Setup

1. **Create a workspace** (or use an existing one) that contains the collections you want to sync.
2. **Prepare your collections:**
   - Add a collection-level variable called `test-plan-id` with the value set to the Xray test plan key (e.g. `PF-703`). This links the collection to a test plan in Jira.
   - Name your folders or requests with the Xray test key as a prefix, separated by a pipe: `PF-101 | Login Tests`. This maps results to the correct test issue in Xray. Nested folders are supported.
3. **Set up a Monitor** for each collection you want to sync. Run the monitor at least once so there's data to pull.

---

## Phase 3 -- Jira/Xray Setup

1. **Create Test Plan** issue(s) in your Jira project (issue type: Test Plan).
2. **Create Test** issues (issue type: Test) for each test scenario. These correspond to your collection folders/requests.
3. **Link the Tests to the Test Plan** -- add each Test issue to the appropriate Test Plan.
4. Make sure the test keys in Jira match the prefixes in your Postman folder/request names (e.g. folder `PF-101 | Login Tests` maps to Jira issue `PF-101`).

---

## Phase 4 -- Run the Service

1. Clone the repo and navigate to the bridge-service directory.
2. Copy `.env.example` to `.env` and fill in:
   - `XRAY_CLIENT_ID` and `XRAY_CLIENT_SECRET` -- from Phase 1
   - `PM_API_KEY` -- from Phase 1
   - `POSTMAN_WORKSPACE_IDS` -- your workspace ID (find it in the workspace URL)
   - `SYNC_BASE_TIME` -- set to today's date (e.g. `2026-03-17T00:00:00Z`) to only sync recent runs
3. Run `docker-compose up -d` to start the bridge service and database.
4. Verify the service is running by hitting the health endpoint: `GET http://localhost:3003/health`
5. Trigger a sync: `POST http://localhost:3003/sync/run` with body `{"workspaceIds": ["your-workspace-id"]}`
6. Check Jira -- a new Test Execution should appear under your Test Plan with pass/fail results.

---

## Phase 5 -- Automate (optional)

Enable the built-in scheduler to sync automatically by setting the following in `.env`:

- `SYNC_ENABLED=true`
- `SYNC_CRON=0 * * * *` (runs every hour; adjust as needed)

Restart the service. It will run an immediate sync on startup, then follow the cron schedule.

---

## Phase 6 -- Production Deployment (when ready)

Two options documented in `docs/DEPLOYMENT.md`:

- **Option A: Docker Compose on EC2** -- single instance, quick setup, good for testing
- **Option B: ECS Fargate + RDS via CloudFormation** -- managed containers and database, auto-restart, backups, no server management

---

## Key things to verify during testing

- Monitor has been triggered at least once before syncing
- `test-plan-id` collection variable is set (not null/empty)
- Folder/request names use the exact Jira test key prefix with pipe separator
- Tests are linked to the Test Plan in Xray
