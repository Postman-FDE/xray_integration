import { Router } from 'express';
import loanRoutes from './loans.js';
import projectRoutes from './projects.js';

const router = Router();

// Mount routes
router.use('/loans', loanRoutes);
router.use('/projects', projectRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'loanflow-service',
    timestamp: new Date().toISOString(),
  });
});

export default router;

