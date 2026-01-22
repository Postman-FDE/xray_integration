/**
 * JSON to JUnit XML Transformer
 * 
 * Converts Postman CLI JSON results to JUnit XML format with Xray test_key properties.
 */

/**
 * Transform Postman CLI JSON results to JUnit XML
 * 
 * @param {Object} results - Postman CLI JSON results
 * @param {Object} folderMap - Map of request ID to folder name (contains test_key like "SJP-2 | ...")
 * @returns {string} - JUnit XML string
 */
export function transformToJUnitXml(results, folderMap = {}) {
  const executions = results.run?.executions || [];
  const meta = results.run?.meta || {};
  
  // Group executions by folder (test)
  const testSuites = groupByFolder(executions, folderMap);
  
  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<testsuites>\n';
  
  for (const [folderName, tests] of Object.entries(testSuites)) {
    const testKey = extractTestKey(folderName);
    const { total, failures, time } = calculateStats(tests);
    
    xml += `  <testsuite name="${escapeXml(folderName)}" tests="${total}" failures="${failures}" time="${time}">\n`;
    
    for (const test of tests) {
      xml += buildTestCase(test, testKey);
    }
    
    xml += `  </testsuite>\n`;
  }
  
  xml += '</testsuites>\n';
  
  return xml;
}

/**
 * Group executions by folder name
 */
function groupByFolder(executions, folderMap) {
  const grouped = {};
  
  for (const exec of executions) {
    const requestId = exec.requestExecuted?.id;
    const requestName = exec.requestExecuted?.name || 'Unknown Request';
    const tests = exec.tests || [];
    
    // Get folder name from map, or use "Ungrouped" if not found
    let folderName = folderMap[requestId] || 'Ungrouped';
    
    if (!grouped[folderName]) {
      grouped[folderName] = [];
    }
    
    // Add each test assertion
    for (const test of tests) {
      grouped[folderName].push({
        requestName,
        testName: test.name,
        status: test.status,
        error: test.error,
        duration: exec.requestExecuted?.responseTime || 0
      });
    }
  }
  
  return grouped;
}

/**
 * Extract test key (e.g., "SJP-2") from folder name like "SJP-2 | Create Loan"
 */
function extractTestKey(folderName) {
  const match = folderName.match(/^([A-Z]+-\d+)\s*\|/);
  return match ? match[1] : null;
}

/**
 * Calculate stats for a test suite
 */
function calculateStats(tests) {
  const total = tests.length;
  const failures = tests.filter(t => t.status === 'failed').length;
  const time = tests.reduce((sum, t) => sum + (t.duration || 0), 0) / 1000; // Convert to seconds
  return { total, failures, time: time.toFixed(3) };
}

/**
 * Build a single testcase XML element
 */
function buildTestCase(test, testKey) {
  const className = escapeXml(test.requestName);
  const name = escapeXml(test.testName);
  const time = ((test.duration || 0) / 1000).toFixed(3);
  
  let xml = `    <testcase classname="${className}" name="${name}" time="${time}">\n`;
  
  // Add test_key property for Xray mapping
  if (testKey) {
    xml += `      <properties>\n`;
    xml += `        <property name="test_key" value="${testKey}"/>\n`;
    xml += `      </properties>\n`;
  }
  
  // Add failure element if test failed
  if (test.status === 'failed' && test.error) {
    const message = escapeXml(test.error.message || 'Test failed');
    xml += `      <failure message="${message}">${escapeXml(test.error.stack || '')}</failure>\n`;
  }
  
  xml += `    </testcase>\n`;
  return xml;
}

/**
 * Escape special XML characters
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

