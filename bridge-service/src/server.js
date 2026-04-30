import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config, validateConfig } from './config.js';
import { startScheduler, isSchedulerRunning } from './scheduler.js';
import { disconnect as disconnectDb } from './store/syncState.js';

const app = express();

// Trust the first hop (LB / CloudFront) so req.ip and rate-limit keying
// reflect the real client, not the proxy. Adjust if multiple proxies sit
// in front of this service.
app.set('trust proxy', 1);

// Middleware - parse request bodies and log requests
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'application/xml', limit: '10mb' })); // For raw XML body
app.use(loggingMiddleware);

// Mount all Routes
app.use(routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const configValid = validateConfig();

app.listen(config.server.port, () => {

  // Optionally start scheduler if enabled
  if (config.sync.enabled && config.postman.workspaceIds.length > 0) {
    startScheduler({
      workspaceIds: config.postman.workspaceIds,
      cronExpression: config.sync.cronExpression
    });
  }

  const schedulerStatus = isSchedulerRunning() 
    ? `Running (${config.sync.cronExpression})` 
    : 'Disabled (set SYNC_ENABLED=true)';

  const triggerAuthStatus = config.bridge.triggerSecret
    ? 'Configured'
    : 'Disabled (set BRIDGE_TRIGGER_SECRET — protected routes return 503)';

  console.log(`
Bridge Service started on http://localhost:${config.server.port}

Endpoints:
  GET  /health           Liveness check
  GET  /ready            Readiness check (pings DB)
  POST /sync/junit       Sync JUnit XML to Xray
  POST /sync/run         Sync monitor runs to Xray
  GET  /scheduler/status Scheduler status
  POST /scheduler/start  Start scheduler
  POST /scheduler/stop   Stop scheduler

Xray:          ${configValid ? 'Configured' : 'Not configured'}
Trigger auth:  ${triggerAuthStatus}
Scheduler:     ${schedulerStatus}
  `);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await disconnectDb();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;

