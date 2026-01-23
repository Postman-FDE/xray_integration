import fs from 'fs';
import * as xrayService from '../services/xrayService.js';
import { transformJUnitXml, getTestKeySummary, replaceTestKeys } from '../transformers/junitToXrayXml.js';
import { resolveTestKeys } from '../services/testResolver.js';
import { cleanupFile } from '../middleware/upload.js';
import { ValidationError, XrayApiError } from '../middleware/errorHandler.js';
import { config } from '../config.js';

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

