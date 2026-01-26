import fs from 'fs';
import * as xrayService from '../services/xrayService.js';
import { transformJUnitXml, getTestKeySummary, replaceTestKeys } from '../transformers/junitToXrayXml.js';
import { resolveTestKeys } from '../services/testResolver.js';
import { cleanupFile } from '../middleware/upload.js';
import { ValidationError, XrayApiError } from '../middleware/errorHandler.js';
import { config } from '../config.js';
import { runSyncJob } from '../workflows/syncJob.js';

/**
 * POST /sync/junit
 * 
 * Accepts JUnit XML and syncs to Xray
 * Supports both:
 * - File upload (multipart/form-data)
 * - Raw XML body (application/xml or text/xml)
 * 
 * Form fields / Query params:
 * - projectKey: Jira project key (optional, e.g., 'SJP')
 * - testPlanKey: Test plan issue key (optional, e.g., 'SJP-1')
 * - testExecKey: Existing test execution key (optional)
 * - testEnvironments: Test environments (optional)
 */
export async function syncJunit(req, res, next) {
  // Determine if this is a file upload or raw body
  const isFileUpload = !!req.file;
  const isRawXml = typeof req.body === 'string' && req.body.trim().startsWith('<?xml');
  
  if (isFileUpload) {
    return syncJunitFile(req, res, next);
  } else if (isRawXml) {
    return syncJunitRaw(req, res, next);
  } else {
    return next(new ValidationError('No JUnit XML provided. Upload a file or send raw XML body.'));
  }
}

/**
 * Handle JUnit XML file upload
 */
async function syncJunitFile(req, res, next) {
  let filePath = null;

  try {
    // Validate file was uploaded
    if (!req.file) {
      throw new ValidationError('No file uploaded. Please upload a JUnit XML file.');
    }

    filePath = req.file.path;

    // Read the XML content
    const xmlContent = fs.readFileSync(filePath, 'utf-8');

    // Get original test keys
    const originalKeys = getTestKeySummary(xmlContent);
    console.log(`[SyncController] Original test identifiers: ${originalKeys.join(', ')}`);

    // Extract options from form fields
    const options = {
      projectKey: req.body.projectKey,
      testPlanKey: req.body.testPlanKey,
      testExecKey: req.body.testExecKey,
      testEnvironments: req.body.testEnvironments,
    };

    // Resolve test keys if Jira API is configured
    let finalXml = xmlContent;
    let resolvedTestPlanKey = options.testPlanKey;
    
    if (config.jira.email && config.jira.apiToken && options.projectKey) {
      try {
        console.log('[SyncController] Resolving test keys via Jira API...');
        const resolution = await resolveTestKeys(xmlContent, options.projectKey);
        
        // Replace logical keys with actual Jira keys
        finalXml = replaceTestKeys(xmlContent, resolution.keyMapping);
        
        // Use resolved test plan key if available
        if (resolution.testPlanKey && !options.testPlanKey) {
          resolvedTestPlanKey = resolution.testPlanKey;
          console.log(`[SyncController] Auto-resolved Test Plan: ${resolvedTestPlanKey}`);
        }
        
        console.log(`[SyncController] Key mapping:`, resolution.keyMapping);
      } catch (error) {
        console.warn(`[SyncController] Test key resolution failed: ${error.message}`);
        console.warn('[SyncController] Falling back to direct import...');
      }
    } else {
      console.log('[SyncController] Jira API not configured, using identifiers as-is');
    }

    // Transform XML to include test_key properties
    const transformedXml = transformJUnitXml(finalXml);
    const finalKeys = getTestKeySummary(finalXml);
    console.log(`[SyncController] Final test keys: ${finalKeys.join(', ')}`);

    // Update options with resolved test plan
    const finalOptions = {
      ...options,
      testPlanKey: resolvedTestPlanKey
    };

    console.log('[SyncController] Sync options:', finalOptions);

    // Import to Xray with transformed XML
    const result = await xrayService.importJUnitResults(transformedXml, finalOptions);

    // Clean up uploaded file
    cleanupFile(filePath);

    res.json({
      success: true,
      message: 'Test results synced to Xray successfully',
      testKeysMapped: finalKeys,
      xray: {
        testExecKey: result.key,
        testExecId: result.id,
        testExecSelf: result.self,
      },
    });
  } catch (error) {
    // Clean up file on error
    cleanupFile(filePath);

    // Wrap Xray errors
    if (error.message.includes('Xray')) {
      return next(new XrayApiError(error.message));
    }

    next(error);
  }
}

/**
 * Handle raw JUnit XML in request body
 */
async function syncJunitRaw(req, res, next) {
  try {
    const xmlContent = req.body;

    if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim() === '') {
      throw new ValidationError('No XML content in request body');
    }

    // Extract options from query params
    const options = {
      projectKey: req.query.projectKey,
      testPlanKey: req.query.testPlanKey,
      testExecKey: req.query.testExecKey,
      testEnvironments: req.query.testEnvironments,
    };

    // Import to Xray
    const result = await xrayService.importJUnitResults(xmlContent, options);

    res.json({
      success: true,
      message: 'Test results synced to Xray successfully',
      xray: {
        testExecKey: result.key,
        testExecId: result.id,
        testExecSelf: result.self,
      },
    });
  } catch (error) {
    if (error.message.includes('Xray')) {
      return next(new XrayApiError(error.message));
    }
    next(error);
  }
}

/**
 * GET /health/xray
 * 
 * Check if Xray credentials are configured
 */
export async function checkStatus(req, res, next) {
  try {
    // Try to authenticate to verify credentials
    await xrayService.authenticate();

    res.json({
      status: 'ok',
      xray: {
        connected: true,
        message: 'Xray credentials are valid',
      },
    });
  } catch (error) {
    res.json({
      status: 'error',
      xray: {
        connected: false,
        message: error.message,
      },
    });
  }
}

/**
 * POST /sync/run
 * 
 * Trigger sync job - fetches runs from real Postman monitor APIs
 * 
 * Flow:
 *   1. Fetch collections from workspace (Postman API)
 *   2. Filter to collections with test-plan-id variable
 *   3. Get monitors for each collection (Monitor API)
 *   4. Sync runs to Xray
 * 
 * Body:
 * - workspaceId: Workspace ID (uses env default if not provided)
 * - monitorId: Specific monitor/jobtemplate ID (optional, skips collection lookup)
 */
export async function runSync(req, res, next) {
  try {
    const { 
      workspaceId,
      monitorId
    } = req.body;

    // Use provided workspaceId, or fall back to first configured workspace
    const effectiveWorkspaceId = workspaceId || config.postman.workspaceIds?.[0];

    if (!monitorId && !effectiveWorkspaceId) {
      throw new ValidationError('workspaceId is required (or set POSTMAN_WORKSPACE_IDS in env)');
    }

    const result = await runSyncJob({ 
      workspaceId: effectiveWorkspaceId,
      monitorId
    });

    res.json({
      success: true,
      message: result.dryRun ? 'Dry run completed' : 'Sync completed',
      result
    });
  } catch (error) {
    if (error.message.includes('Not implemented')) {
      return res.status(501).json({
        error: 'Not implemented',
        message: error.message
      });
    }
    next(error);
  }
}
