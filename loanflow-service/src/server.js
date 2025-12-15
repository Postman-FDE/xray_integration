import express from 'express';
import routes from './routes/index.js';
import { loggingMiddleware } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(loggingMiddleware);

// Routes
app.use(routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏦  LOANFLOW SERVICE                                     ║
║                                                            ║
║   LoanFlow API is running!                         ║
║                                                            ║
║   Local:  http://localhost:${PORT}                           ║
║   Health: http://localhost:${PORT}/health                    ║
║                                                            ║
║   Endpoints:                                               ║
║   • POST   /loans                                          ║
║   • GET    /loans/:loanId                                  ║
║   • POST   /loans/:loanId/change-order                     ║
║   • POST   /loans/:loanId/cancel                           ║
║   • POST   /loans/:loanId/contract-review                  ║
║   • POST   /projects                                       ║
║   • GET    /projects/:projectId                            ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;

