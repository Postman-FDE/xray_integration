import fs from 'fs/promises';
import { importJUnitResults } from '../clients/xrayClient.js';
import { transformJUnitXml, getTestKeySummary } from '../transformers/junitToXrayXml.js';
import { cleanupFile } from '../middleware/upload.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { config } from '../config.js';
import * as syncService from '../services/sync.service.js';

/**
 * POST /sync/junit
 * 
 * Accepts a JUnit XML file upload and syncs to Xray.
 * 
 * Form fields:
 * - file: JUnit XML file (required)
 * - projectKey: Jira project key (optional, e.g., 'SJP')
 * - testPlanKey: Test plan issue key (optional, e.g., 'SJP-1')
 * - testExecKey: Existing test execution key (optional)
 * - testEnvironments: Test environments (optional)
 */
export async function syncJunit(req, res, next) {
  let filePath = null;

  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded. Please upload a JUnit XML file.');
    }

    filePath = req.file.path;
    const xmlContent = await fs.readFile(filePath, 'utf-8');

    const options = {
      projectKey: req.body.projectKey,
      testPlanKey: req.body.testPlanKey,
      testExecKey: req.body.testExecKey,
      testEnvironments: req.body.testEnvironments,
    };

    const transformedXml = transformJUnitXml(xmlContent);
    const testKeys = getTestKeySummary(xmlContent);

    const result = await importJUnitResults(transformedXml, options);

    cleanupFile(filePath);

    res.json({
      success: true,
      message: 'Test results synced to Xray successfully',
      testKeysMapped: testKeys,
      xray: {
        testExecKey: result.key,
        testExecId: result.id,
        testExecSelf: result.self,
      },
    });
  } catch (error) {
    cleanupFile(filePath);
    next(error);
  }
}

/**
 * POST /sync/run
 * 
 * Trigger sync job - fetches runs from Postman monitor APIs and syncs to Xray.
 * Supports multiple workspaces.
 * 
 * Body:
 * - workspaceId: Single workspace ID (optional)
 * - workspaceIds: Array of workspace IDs (optional)
 * Falls back to POSTMAN_WORKSPACE_IDS from env if neither provided.
 */
export async function syncRuns(req, res, next) {
  try {
    const { workspaceId, workspaceIds } = req.body;

    const effectiveIds = workspaceIds
      || (workspaceId ? [workspaceId] : null)
      || config.postman.workspaceIds;

    if (!effectiveIds || effectiveIds.length === 0) {
      throw new ValidationError('workspaceId or workspaceIds is required (or set POSTMAN_WORKSPACE_IDS in env)');
    }

    const results = await Promise.all(
      effectiveIds.map(wsId => syncService.syncRuns({ workspaceId: wsId }))
    );

    res.json({
      success: true,
      message: 'Sync completed',
      results
    });
  } catch (error) {
    next(error);
  }
}
