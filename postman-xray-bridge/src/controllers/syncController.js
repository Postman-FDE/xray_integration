import fs from 'fs';
import * as xrayService from '../services/xrayService.js';
import { transformJUnitXml, getTestKeySummary } from '../services/junitTransformer.js';
import { cleanupFile } from '../middleware/upload.js';
import { ValidationError, XrayApiError } from '../middleware/errorHandler.js';

/**
 * POST /sync
 * 
 * Accepts JUnit XML file and syncs to Xray
 * 
 * Form fields:
 * - file: JUnit XML file (required)
 * - projectKey: Jira project key (optional, e.g., 'SJP')
 * - testPlanKey: Test plan issue key (optional, e.g., 'SJP-1')
 * - testExecKey: Existing test execution key (optional)
 * - testEnvironments: Test environments (optional)
 */
export async function syncResults(req, res, next) {
  let filePath = null;

  try {
    // Validate file was uploaded
    if (!req.file) {
      throw new ValidationError('No file uploaded. Please upload a JUnit XML file.');
    }

    filePath = req.file.path;
    console.log(`[SyncController] Received file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Read the XML content
    const xmlContent = fs.readFileSync(filePath, 'utf-8');

    // Transform XML to include test_key properties
    const transformedXml = transformJUnitXml(xmlContent);
    const testKeys = getTestKeySummary(xmlContent);
    
    console.log(`[SyncController] Transformed XML with test keys: ${testKeys.join(', ')}`);

    // Extract options from form fields
    const options = {
      projectKey: req.body.projectKey,
      testPlanKey: req.body.testPlanKey,
      testExecKey: req.body.testExecKey,
      testEnvironments: req.body.testEnvironments,
    };

    console.log('[SyncController] Sync options:', options);

    // Import to Xray with transformed XML
    const result = await xrayService.importJUnitResults(transformedXml, options);

    // Clean up uploaded file
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
 * POST /sync/raw
 * 
 * Accepts raw JUnit XML in request body
 * Content-Type: application/xml
 */
export async function syncResultsRaw(req, res, next) {
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

    console.log('[SyncController] Raw sync options:', options);

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
 * POST /sync/preview
 * 
 * Preview the transformed JUnit XML without sending to Xray
 * Useful for debugging the transformation
 */
export async function previewTransform(req, res, next) {
  let filePath = null;

  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded. Please upload a JUnit XML file.');
    }

    filePath = req.file.path;
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    
    // Transform XML
    const transformedXml = transformJUnitXml(xmlContent);
    const testKeys = getTestKeySummary(xmlContent);
    
    // Clean up
    cleanupFile(filePath);

    res.type('application/xml').send(transformedXml);
  } catch (error) {
    cleanupFile(filePath);
    next(error);
  }
}

/**
 * GET /sync/status
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

