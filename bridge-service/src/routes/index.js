/**
 * All routes for postman-xray-bridge
 */

import { Router } from 'express';
import { uploadXml } from '../middleware/upload.js';
import * as syncController from '../controllers/sync.controller.js';
import * as jobsController from '../controllers/jobsController.js';

const router = Router();

// ============================================================================
// Health endpoints
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'postman-xray-bridge',
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Sync endpoints
// ============================================================================

// JUnit XML sync (supports both file upload and raw body)
// - multipart/form-data: file upload
// - application/xml or text/xml: raw body
router.post('/sync/junit', uploadXml, syncController.syncJunit);

// Real Postman APIs sync (monitors + collection runs)
router.post('/sync/run', syncController.syncRuns);

// Mock-based sync (legacy - uses mock collection run results API)

// ============================================================================
// Scheduler endpoints
// ============================================================================
router.get('/scheduler/status', jobsController.getStatus);
router.post('/scheduler/start', jobsController.startScheduler);
router.post('/scheduler/stop', jobsController.stopScheduler);

export default router;
