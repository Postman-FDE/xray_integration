import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config, validateConfig } from './config.js';
import { startScheduler, isSchedulerRunning } from './jobs/scheduler.js';

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
  if (config.sync.enabled && config.postmanWorkspaceIds.length > 0) {
    startScheduler({
      workspaceIds: config.postmanWorkspaceIds,
      cronExpression: config.sync.cronExpression
    });
  }

  const schedulerStatus = isSchedulerRunning() 
    ? `✅ Running (${config.sync.cronExpression})` 
    : '⏸️  Disabled (set SYNC_ENABLED=true)';
  
  const workspaceCount = config.postmanWorkspaceIds.length;

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
║   Manual Sync Endpoints:                                   ║
║   • POST   /sync              Upload JUnit XML file        ║
║   • POST   /sync/preview      Preview transformed XML      ║
║   • GET    /sync/status       Check Xray connection        ║
║                                                            ║
║   Auto-Sync (Cron) Endpoints:                              ║
║   • POST   /jobs/sync/run     Trigger sync now             ║
║   • GET    /jobs/sync/status  Get scheduler status         ║
║   • POST   /jobs/sync/start   Start scheduler              ║
║   • POST   /jobs/sync/stop    Stop scheduler               ║
║   • POST   /jobs/sync/reset   Reset sync state             ║
║                                                            ║
║   Xray:      ${configValid ? '✅ Configured' : '⚠️  Not configured'}                            ║
║   Scheduler: ${schedulerStatus}       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;

