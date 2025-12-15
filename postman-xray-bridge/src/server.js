import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config, validateConfig } from './config.js';

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
║   Endpoints:                                               ║
║   • POST   /sync          Upload JUnit XML file            ║
║   • POST   /sync/raw      Raw XML in request body          ║
║   • GET    /sync/status   Check Xray connection            ║
║                                                            ║
║   Xray Config: ${configValid ? '✅ Configured' : '⚠️  Not configured (set env vars)'}              ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;

