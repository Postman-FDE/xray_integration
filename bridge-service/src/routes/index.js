/**
 * All routes for postman-xray-bridge
 */

import { Router } from 'express';
import { uploadXml } from '../middleware/upload.js';
import { requireBridgeSecret } from '../middleware/auth.js';
import { triggerRateLimit } from '../middleware/rateLimit.js';
import * as syncController from '../controllers/sync.controller.js';
import * as jobsController from '../controllers/jobsController.js';
import { prisma } from '../../prisma/client.js';

const router = Router();

// ============================================================================
// Health endpoints
// ============================================================================

// Liveness: process is up. Used by container/load-balancer probes.
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'postman-xray-bridge',
    timestamp: new Date().toISOString(),
  });
});

// Readiness: process is up AND can reach the database. Use this for LB
// target-group health checks if you want the bridge removed from rotation
// when the DB is unreachable. Times out fast so a slow DB doesn't hang
// the probe.
router.get('/ready', async (req, res) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('db check timed out')), 2000)
  );
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    res.json({ status: 'ready', db: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'not-ready', db: error.message });
  }
});

// ============================================================================
// Sync endpoints
// ============================================================================

// JUnit XML upload (multipart/form-data)
router.post('/sync/junit', triggerRateLimit, requireBridgeSecret, uploadXml, syncController.syncJunit);

// Sync monitor runs to Xray
router.post('/sync/run', triggerRateLimit, requireBridgeSecret, syncController.syncRuns);

// ============================================================================
// Scheduler endpoints
// ============================================================================
router.get('/scheduler/status', triggerRateLimit, requireBridgeSecret, jobsController.getStatus);
router.post('/scheduler/start', triggerRateLimit, requireBridgeSecret, jobsController.startScheduler);
router.post('/scheduler/stop', triggerRateLimit, requireBridgeSecret, jobsController.stopScheduler);

export default router;
