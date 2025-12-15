import { Router } from 'express';
import syncRoutes from './sync.js';

const router = Router();

// Mount routes
router.use('/sync', syncRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'postman-xray-bridge',
    timestamp: new Date().toISOString(),
  });
});

export default router;

