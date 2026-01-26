/**
 * Monitor JSON to Xray JSON Transformer
 * 
 * Converts Postman Monitor run logs (from newman-remote-api) to Xray JSON format.
 * 
 * Monitor log structure:
 * - data[0].log[] - array of events
 * - Events: beforeItem, assertion, test, item, etc.
 * - Assertions have cursor.ref pointing to item
 * 
 * IMPORTANT: The item names in monitor logs don't contain test keys.
 * We need a folderMap (requestId -> folderName with test key) from the collection.
 */

import { Buffer } from 'buffer';

/**
 * Transform Monitor run log to Xray JSON format
 * 
 * @param {Object} runLog - Monitor run log from /runs/:runId/log
 * @param {Object} folderMap - Map of request ID to folder name (contains test_key like "PF-52 | ...")
 * @param {Object} options - Additional options
 * @param {string} options.testPlanKey - Test plan key (e.g., "PF-141")
 * @param {string} options.collectionName - Collection name for summary
 * @returns {Object} - Xray JSON import payload
 */
export function transformToXrayJson(runLog, folderMap = {}, options = {}) {
  const runData = runLog.data?.[0] || runLog;
  const log = runData.log || [];
  
  // Extract run metadata
  const runId = runData.id;
  const startedAt = runData.startedAt;
  const finishedAt = runData.finishedAt;
  const results = runData.results || {};
  
  // Build item map from beforeItem events (itemRef -> itemInfo)
  const itemMap = buildItemMap(log);
  
  // Extract assertions and group by folder (using folderMap)
  const testResults = extractTestResults(log, itemMap, folderMap);
  
  // Extract project key from testPlanKey (e.g., "PF-141" → "PF")
  const projectKey = options.testPlanKey ? options.testPlanKey.split('-')[0] : undefined;
  
  // Calculate duration in ms
  const duration = startedAt && finishedAt 
    ? new Date(finishedAt) - new Date(startedAt) 
    : null;
  
  // Build description
  let description = `**Trigger:** Monitor Run`;
  description += `\n**Run ID:** ${runId}`;
  if (runData.logUrl) {
    description += `\n**Log URL:** [View Details](${runData.logUrl})`;
  }
  if (duration) {
    description += `\n**Duration:** ${duration}ms`;
  }
  description += `\n**Passed:** ${results.passedTestCount || 0} | **Failed:** ${results.failedTestCount || 0}`;
  description += `\n\nAutomated test execution synced from Postman Monitor`;

  // Build Xray JSON payload
  const payload = {
    testExecutionKey: options.testExecutionKey || undefined,
    info: {
      project: projectKey,
      summary: `${options.collectionName || 'Monitor Run'} - ${new Date(startedAt || Date.now()).toISOString().split('T')[0]}`,
      description: description,
      startDate: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
      finishDate: finishedAt ? new Date(finishedAt).toISOString() : new Date().toISOString(),
      testPlanKey: options.testPlanKey
    },
    tests: testResults
  };
  
  return payload;
}

/**
 * Build a map of item refs to item info from beforeItem events
 */
function buildItemMap(log) {
  const itemMap = {};
  
  for (const entry of log) {
    if (entry.event === 'beforeItem' && entry.args?.item) {
      const item = entry.args.item;
      const ref = entry.args.cursor?.ref;
      
      if (ref && item) {
        itemMap[ref] = {
          id: item.id,
          name: item.name,
          method: item.request?.method,
          url: item.request?.url
        };
      }
    }
  }
  
  return itemMap;
}

/**
 * Extract test results from assertion events
 * 
 * @param {Array} log - Log events from monitor run
 * @param {Object} itemMap - Map of item ref to item info (from beforeItem events)
 * @param {Object} folderMap - Map of request ID to folder name (from collection)
 */
function extractTestResults(log, itemMap, folderMap) {
  // Group assertions by test key (from folder)
  const grouped = {};
  
  for (const entry of log) {
    if (entry.event === 'assertion' && entry.args?.assertion) {
      const assertions = entry.args.assertion;
      const ref = entry.args.cursor?.ref;
      const itemInfo = itemMap[ref] || { name: 'Unknown Request', id: null };
      
      // Try to get folder name from folderMap using item ID
      const folderName = folderMap[itemInfo.id] || null;
      
      // Extract test key from folder name (e.g., "PF-52 | Create Loan" → "PF-52")
      // If no folderMap entry, fall back to item name pattern
      const testKey = extractTestKey(folderName) || extractTestKey(itemInfo.name);
      
      if (!testKey) {
        // Skip items without test keys (silent - this is expected for non-test requests)
        continue;
      }
      
      if (!grouped[testKey]) {
        grouped[testKey] = {
          testKey,
          folderName: folderName || itemInfo.name,
          assertions: [],
          totalTime: 0
        };
      }
      
      // Add each assertion
      for (const assertion of assertions) {
        grouped[testKey].assertions.push({
          requestName: itemInfo.name,
          assertionName: assertion.name,
          status: assertion.passed ? 'passed' : 'failed',
          skipped: assertion.skipped,
          error: assertion.error ? { message: assertion.error.message || JSON.stringify(assertion.error) } : null
        });
      }
    }
  }
  
  console.log(`Found ${Object.keys(grouped).length} test(s) with test keys`);
  
  // Convert to Xray test format
  return Object.values(grouped).map(test => {
    const allPassed = test.assertions.every(a => a.status === 'passed' || a.skipped);
    const hasFailed = test.assertions.some(a => a.status === 'failed');
    
    const status = hasFailed ? 'FAILED' : allPassed ? 'PASSED' : 'PASSED';
    
    // Build comment with assertion summary
    const comment = buildComment(test.assertions);
    
    // Build evidences with detailed assertion results
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
 * Extract test key (e.g., "PF-52") from item name like "PF-52 | Create Loan"
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
      comment += `• ${f.assertionName}`;
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
      skipped: test.assertions.filter(a => a.skipped).length,
      total: test.assertions.length,
    },
    assertions: test.assertions.map(a => ({
      request: a.requestName,
      assertion: a.assertionName,
      status: a.status.toUpperCase(),
      skipped: a.skipped || false,
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
