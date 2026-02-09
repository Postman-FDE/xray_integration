/**
 * Monitor Result to Xray JSON Transformer
 * 
 * Converts Postman Monitor run summary (from newman-remote-api /summary endpoint) to Xray JSON format.
 * 
 * This transformer works with the new simplified response structure:
 * - run: { id, status, startedAt, finishedAt, duration }
 * - monitor: { id, name }
 * - collection: { id, name }
 * - summary: { totalRequests, totalAssertions, passedAssertions, failedAssertions }
 * - requests[]: array of requests with assertions, headers, response info
 */

import { Buffer } from 'buffer';

/**
 * Transform Monitor run summary to Xray JSON format
 * 
 * @param {Object} runSummary - Monitor run summary from /runs/:runId/summary
 * @param {Object} folderMap - Map of request ID to folder name (contains test keys like "PF-52 | ...")
 * @param {Object} options - Additional options
 * @param {string} options.testPlanKey - Test plan key (e.g., "PF-141")
 * @param {string} options.testExecutionKey - Existing test execution key to update
 * @returns {Object} - Xray JSON import payload
 */
export function transformToXrayJson(runSummary, folderMap = {}, options = {}) {
  const { run, monitor, collection, summary, requests } = runSummary;
  
  // Group requests by test key (from folderMap or request name)
  const testResults = extractTestResults(requests, folderMap);
  
  // Extract project key from testPlanKey (e.g., "PF-141" → "PF")
  const projectKey = options.testPlanKey ? options.testPlanKey.split('-')[0] : undefined;
  
  // Build description
  let description = `**Trigger:** Monitor Run`;
  description += `\n**Run ID:** ${run?.id || 'N/A'}`;
  description += `\n**Status:** ${run?.status?.state || 'unknown'}`;
  if (run?.duration) {
    description += `\n**Duration:** ${run.duration}ms`;
  }
  if (monitor?.id) {
    description += `\n**Monitor ID:** ${monitor.id}`;
  }
  description += `\n**Passed:** ${summary?.passedAssertions || 0} | **Failed:** ${summary?.failedAssertions || 0}`;
  description += `\n\nAutomated test execution synced from Postman Monitor`;

  // Build Xray JSON payload
  const payload = {
    testExecutionKey: options.testExecutionKey || undefined,
    info: {
      project: projectKey,
      summary: `${collection?.name || monitor?.name || 'Monitor Run'} - ${new Date(run?.startedAt || Date.now()).toISOString().split('T')[0]}`,
      description: description,
      startDate: run?.startedAt ? new Date(run.startedAt).toISOString() : new Date().toISOString(),
      finishDate: run?.finishedAt ? new Date(run.finishedAt).toISOString() : new Date().toISOString(),
      testPlanKey: options.testPlanKey
    },
    tests: testResults
  };
  
  return payload;
}

/**
 * Extract test results from requests, grouped by test key
 * 
 * @param {Array} requests - Array of request objects from run summary
 * @param {Object} folderMap - Map of request ID to folder name (contains test keys)
 * @returns {Array} - Array of Xray test results
 */
function extractTestResults(requests, folderMap = {}) {
  if (!requests || !Array.isArray(requests)) {
    return [];
  }
  
  // DEBUG: Log folderMap keys
  const folderMapKeys = Object.keys(folderMap);
  console.log('[DEBUG] folderMap keys (first 5):', folderMapKeys.slice(0, 5));
  console.log('[DEBUG] Total folderMap entries:', folderMapKeys.length);
  
  // Group requests by test key
  // Priority: 1) folderMap (request ID -> folder name), 2) request name pattern
  const grouped = {};
  
  for (const request of requests) {
    // requestId from /summary has format "uuid-N" where N is iteration number
    // Strip the suffix to get the collection item ID for folderMap lookup
    const baseRequestId = request.requestId?.replace(/-\d+$/, '') || null;
    
    // Look up folder by requestId (collection item ID) from the /summary response
    const folderName = folderMap[baseRequestId] || null;
    
    // DEBUG: Log each lookup
    console.log(`[DEBUG] Request: "${request.name}" | requestId: "${request.requestId}" | baseId: "${baseRequestId}" | folderName: ${folderName || 'NOT FOUND'}`);
    
    // Extract test key from folder name first, then fall back to request name
    const testKey = extractTestKey(folderName) || extractTestKey(request.name);
    
    if (!testKey) {
      // Skip requests without test keys (not part of a tracked test)
      console.log(`[DEBUG] No test key found for request "${request.name}", skipping`);
      continue;
    }
    
    if (!grouped[testKey]) {
      grouped[testKey] = {
        testKey,
        requestName: request.name,
        requests: [],
        assertions: []
      };
    }
    
    // Store full request info for evidence
    grouped[testKey].requests.push({
      id: request.id,
      name: request.name,
      method: request.method,
      url: request.url,
      headers: request.headers,
      response: request.response,
      consoleLogs: request.consoleLogs
    });
    
    // Add assertions with request context
    if (request.assertions && Array.isArray(request.assertions)) {
      for (const assertion of request.assertions) {
        grouped[testKey].assertions.push({
          requestName: request.name,
          requestMethod: request.method,
          requestUrl: request.url,
          assertionName: assertion.name,
          status: assertion.passed ? 'passed' : 'failed',
          skipped: assertion.skipped,
          error: assertion.error
        });
      }
    }
  }
  
  console.log(`[Transformer] Found ${Object.keys(grouped).length} test(s) with test keys`);
  
  // Convert to Xray test format
  return Object.values(grouped).map(test => {
    const allPassed = test.assertions.every(a => a.status === 'passed' || a.skipped);
    const hasFailed = test.assertions.some(a => a.status === 'failed');
    
    const status = hasFailed ? 'FAILED' : allPassed ? 'PASSED' : 'PASSED';
    
    // Build comment with assertion summary
    const comment = buildComment(test.assertions);
    
    // Build evidences with detailed results
    const evidences = buildEvidences(test);
    
    return {
      testKey: test.testKey,
      status,
      comment,
      evidences
    };
  });
}

/**
 * Extract test key (e.g., "PF-52") from request name like "PF-52 | Create Loan"
 */
function extractTestKey(itemName) {
  if (!itemName) return null;
  const match = itemName.match(/^([A-Z]+-\d+)\s*\|/);
  return match ? match[1] : null;
}

/**
 * Build a comment summarizing the test results
 */
function buildComment(assertions) {
  const passed = assertions.filter(a => a.status === 'passed').length;
  const failed = assertions.filter(a => a.status === 'failed').length;
  const skipped = assertions.filter(a => a.skipped).length;
  const total = assertions.length;
  
  let comment = `**${passed}/${total}** assertions passed`;
  
  if (skipped > 0) {
    comment += ` (${skipped} skipped)`;
  }
  
  if (failed > 0) {
    comment += `\n\n**Failures:**\n`;
    const failures = assertions.filter(a => a.status === 'failed');
    for (const f of failures) {
      comment += `• \`${f.requestMethod} ${f.requestName}\`: ${f.assertionName}`;
      if (f.error?.message) {
        comment += `\n  → ${f.error.message}`;
      }
      comment += '\n';
    }
  }
  
  return comment;
}

/**
 * Build evidences array with detailed test results as a JSON attachment
 * Includes request/response headers for debugging
 */
function buildEvidences(test) {
  const evidenceContent = {
    testKey: test.testKey,
    summary: {
      passed: test.assertions.filter(a => a.status === 'passed').length,
      failed: test.assertions.filter(a => a.status === 'failed').length,
      skipped: test.assertions.filter(a => a.skipped).length,
      total: test.assertions.length
    },
    requests: test.requests.map(req => ({
      name: req.name,
      method: req.method,
      url: req.url,
      requestHeaders: sanitizeHeaders(req.headers),
      response: {
        statusCode: req.response?.statusCode,
        statusText: req.response?.statusText,
        responseTime: req.response?.responseTime,
        responseSize: req.response?.responseSize,
        headers: sanitizeHeaders(req.response?.headers)
      }
    })),
    assertions: test.assertions.map(a => ({
      request: a.requestName,
      assertion: a.assertionName,
      status: a.status.toUpperCase(),
      skipped: a.skipped || false,
      error: a.error?.message || a.error?.name || undefined
    }))
  };

  const base64Data = Buffer.from(JSON.stringify(evidenceContent, null, 2)).toString('base64');

  return [{
    data: base64Data,
    filename: `${test.testKey}-results.json`,
    contentType: 'application/json'
  }];
}

/**
 * Sanitize headers by removing null values and sensitive tokens
 */
function sanitizeHeaders(headers) {
  if (!headers) return {};
  
  const sanitized = {};
  const sensitiveKeys = ['authorization', 'x-api-key', 'api-key', 'postman-token', 'x-postman-monitor-trace'];
  
  for (const [key, value] of Object.entries(headers)) {
    if (value === null || value === undefined) {
      continue; // Skip null/undefined values
    }
    
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export default { transformToXrayJson };
