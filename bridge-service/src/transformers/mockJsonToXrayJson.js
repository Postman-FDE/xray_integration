/**
 * JSON to Xray JSON Transformer
 * 
 * Converts Postman collection run results to Xray JSON format.
 * Supports both:
 *   - Raw CLI format: { run: { meta, executions } }
 *   - Clean API format: { meta, executions }
 */

import { Buffer } from 'buffer';

/**
 * Transform Postman collection run results to Xray JSON format
 * 
 * @param {Object} results - Collection run results (CLI or API format)
 * @param {Object} folderMap - Map of request ID to folder name (contains test_key like "SJP-2 | ...")
 * @param {Object} options - Additional options
 * @param {string} options.testPlanKey - Test plan key (e.g., "SJP-1")
 * @returns {Object} - Xray JSON import payload
 */
export function transformToXrayJson(results, folderMap = {}, options = {}) {
  // Support both CLI format (results.run.executions) and API format (results.executions)
  const executions = results.run?.executions || results.executions || [];
  const meta = results.run?.meta || results.meta || {};
  
  // Group executions by folder (test)
  const testResults = groupByTest(executions, folderMap);
  
  // Extract project key from testPlanKey (e.g., "SJP-1" → "SJP")
  const projectKey = options.testPlanKey ? options.testPlanKey.split('-')[0] : undefined;
  
  // Build rich description with trigger source, run URL, and duration
  let description = `**Trigger:** ${meta.triggerSource || 'N/A'}`;
  if (meta.runUrl) {
    description += `\n**Postman Run:** [View Details](${meta.runUrl})`;
  }
  if (meta.duration) {
    description += `\n**Duration:** ${meta.duration}ms`;
  }
  description += `\n\nAutomated test execution synced from Postman`;

  // Build Xray JSON payload
  const payload = {
    testExecutionKey: options.testExecutionKey || undefined,
    info: {
      project: projectKey,
      summary: `${meta.collectionName || 'Postman Collection'} - ${new Date(meta.started || Date.now()).toISOString().split('T')[0]}`,
      description: description,
      startDate: meta.started ? new Date(meta.started).toISOString() : new Date().toISOString(),
      finishDate: meta.completed ? new Date(meta.completed).toISOString() : new Date().toISOString(),
      testPlanKey: options.testPlanKey
    },
    tests: testResults
  };
  
  return payload;
}

/**
 * Group executions by test (folder) and determine overall status
 * Supports both CLI format and clean API format
 */
function groupByTest(executions, folderMap) {
  const grouped = {};
  
  for (const exec of executions) {
    // Support both CLI format (exec.requestExecuted.id) and API format (exec.requestId)
    const requestId = exec.requestExecuted?.id || exec.requestId;
    const requestName = exec.requestExecuted?.name || exec.requestName || 'Unknown Request';
    const tests = exec.tests || [];
    const responseTime = exec.response?.responseTime || exec.responseTime || 0;
    
    // Get folder name from map
    const folderName = folderMap[requestId] || 'Ungrouped';
    const testKey = extractTestKey(folderName);
    
    if (!testKey) continue; // Skip if no test key found
    
    if (!grouped[testKey]) {
      grouped[testKey] = {
        testKey,
        folderName,
        assertions: [],
        totalTime: 0
      };
    }
    
    // Add assertions from this request
    for (const test of tests) {
      // Normalize error: API format uses string, CLI format uses { message: string }
      const errorMessage = typeof test.error === 'string' 
        ? test.error 
        : test.error?.message || null;
      
      grouped[testKey].assertions.push({
        requestName,
        assertionName: test.name,
        status: test.status,
        error: errorMessage ? { message: errorMessage } : null
      });
    }
    
    grouped[testKey].totalTime += responseTime;
  }
  
  // Convert to Xray test format
  return Object.values(grouped).map(test => {
    const allPassed = test.assertions.every(a => a.status === 'passed');
    const hasFailed = test.assertions.some(a => a.status === 'failed');
    
    const status = hasFailed ? 'FAILED' : allPassed ? 'PASSED' : 'PASSED';
    
    // Build comment with assertion summary and failure details
    const comment = buildComment(test.assertions);
    
    // Build evidences with detailed assertion results as JSON attachment
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
 * Extract test key (e.g., "SJP-2") from folder name like "SJP-2 | Create Loan"
 */
function extractTestKey(folderName) {
  const match = folderName.match(/^([A-Z]+-\d+)\s*\|/);
  return match ? match[1] : null;
}

/**
 * Build a comment summarizing the test results
 * Includes detailed failure messages for failing tests
 */
function buildComment(assertions) {
  const passed = assertions.filter(a => a.status === 'passed').length;
  const failed = assertions.filter(a => a.status === 'failed').length;
  const total = assertions.length;
  
  let comment = `**${passed}/${total}** assertions passed`;
  
  if (failed > 0) {
    comment += `\n\n**Failures:**\n`;
    const failures = assertions.filter(a => a.status === 'failed');
    for (const f of failures) {
      comment += `• ${f.requestName}: ${f.assertionName}`;
      if (f.error?.message) {
        comment += `\n  → ${f.error.message}`;
      }
      comment += '\n';
    }
  }
  
  return comment;
}

/**
 * Build evidences array with detailed assertion results as a JSON attachment
 */
function buildEvidences(test) {
  const evidenceContent = {
    testKey: test.testKey,
    folder: test.folderName,
    summary: {
      passed: test.assertions.filter(a => a.status === 'passed').length,
      failed: test.assertions.filter(a => a.status === 'failed').length,
      total: test.assertions.length,
    },
    assertions: test.assertions.map(a => ({
      request: a.requestName,
      assertion: a.assertionName,
      status: a.status.toUpperCase(),
      error: a.error?.message || undefined,
    })),
  };

  const base64Data = Buffer.from(JSON.stringify(evidenceContent, null, 2)).toString('base64');

  return [{
    data: base64Data,
    filename: `${test.testKey}-assertions.json`,
    contentType: 'application/json'
  }];
}
