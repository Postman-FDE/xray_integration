import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config, validateConfig } from './config.js';
import { startScheduler, isSchedulerRunning } from './workflows/scheduler.js';
import { disconnect as disconnectDb } from './store/syncState.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.text({ type: 'application/xml' })); // For raw XML body
app.use(loggingMiddleware);

// Routes
app.use(routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(config.server.port, () => {
  const configValid = validateConfig();

  // Optionally start scheduler if enabled
  if (config.sync.enabled && config.postman.workspaceIds.length > 0) {
    startScheduler({
      workspaceIds: config.postman.workspaceIds,
      cronExpression: config.sync.cronExpression
    });
  }

  const schedulerStatus = isSchedulerRunning() 
    ? `✅ Running (${config.sync.cronExpression})` 
    : '⏸️  Disabled (set SYNC_ENABLED=true)';
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔗  POSTMAN-XRAY-BRIDGE                                  ║
║                                                            ║
║   Sync Postman/Newman results to Jira Xray                 ║
║                                                            ║
║   Local:  http://localhost:${config.server.port}                           ║
║   Health: http://localhost:${config.server.port}/health                    ║
║                                                            ║
║   Health Endpoints:                                        ║
║   • GET    /health            Server health                ║
║   • GET    /health/xray       Xray connection check        ║
║                                                            ║
║   Sync Endpoints:                                          ║
║   • POST   /sync/junit        Sync JUnit XML to Xray       ║
║   • POST   /sync/run          Sync from Postman APIs       ║
║   • POST   /sync/run/mock     Sync from mock APIs          ║
║                                                            ║
║   Scheduler Endpoints:                                     ║
║   • GET    /scheduler/status  Get scheduler status         ║
║   • POST   /scheduler/start   Start scheduler              ║
║   • POST   /scheduler/stop    Stop scheduler               ║
║   • POST   /scheduler/reset   Reset sync state             ║
║                                                            ║
║   Xray:      ${configValid ? '✅ Configured' : '⚠️  Not configured'}                            ║
║   Scheduler: ${schedulerStatus}       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
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

