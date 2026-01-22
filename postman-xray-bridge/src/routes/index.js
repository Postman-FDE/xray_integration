/**
 * All routes for postman-xray-bridge
 */

import { Router } from 'express';
import { uploadXml } from '../middleware/upload.js';
import * as syncController from '../controllers/syncController.js';
import * as jobsController from '../controllers/jobsController.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'postman-xray-bridge',
    timestamp: new Date().toISOString(),
  });
});

// Sync routes (JUnit XML upload)
router.post('/sync', uploadXml, syncController.syncResults);
router.post('/sync/raw', syncController.syncResultsRaw);
router.post('/sync/preview', uploadXml, syncController.previewTransform);
router.get('/sync/status', syncController.checkStatus);

// Jobs routes (scheduler management)
router.post('/jobs/sync/run', jobsController.runSync);
router.get('/jobs/sync/status', jobsController.getStatus);
router.post('/jobs/sync/start', jobsController.startScheduler);
router.post('/jobs/sync/stop', jobsController.stopScheduler);
router.post('/jobs/sync/reset', jobsController.resetState);

export default router;
