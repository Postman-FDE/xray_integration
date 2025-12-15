import { Router } from 'express';
import { uploadXml } from '../middleware/upload.js';
import * as syncController from '../controllers/syncController.js';

const router = Router();

// POST /sync - Upload JUnit XML file and sync to Xray
router.post('/', uploadXml, syncController.syncResults);

// POST /sync/raw - Send raw XML in request body
router.post('/raw', syncController.syncResultsRaw);

// GET /sync/status - Check Xray connection status
router.get('/status', syncController.checkStatus);

export default router;

