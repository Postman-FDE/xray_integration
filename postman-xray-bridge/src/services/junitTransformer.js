/**
 * JUnit XML Transformer
 * 
 * Transforms JUnit XML output from Postman CLI to include test_key properties
 * that map testcases to existing Xray tests.
 */

/**
 * Extract test key (e.g., "SJP-2") from testsuite name
 * 
 * Input: "SJP-2 | Change Order API Test / Setup - Create Loan"
 * Output: "SJP-2"
 */
function extractTestKey(testsuiteName) {
  if (!testsuiteName) return null;
  
  // Match pattern like "SJP-2" or "ABC-123" at the start
  const match = testsuiteName.match(/^([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

/**
 * Transform JUnit XML to include test_key properties
 * 
 * @param {string} xmlContent - Original JUnit XML from Postman CLI
 * @returns {string} - Transformed JUnit XML with test_key properties
 */
export function transformJUnitXml(xmlContent) {
  // Regex to match testsuite with its testcases
  // We need to process each testsuite and inject test_key into its testcases
  
  const transformed = xmlContent.replace(
    /<testsuite\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/testsuite>/g,
    (match, testsuiteName, attrs, content) => {
      const testKey = extractTestKey(testsuiteName);
      
      if (!testKey) {
        // No test key found, return unchanged
        return match;
      }
      
      // Transform testcases to include test_key property
      let transformedContent = content;
      
      // First, handle testcases with content (failures, errors, etc.): <testcase ...>content</testcase>
      transformedContent = transformedContent.replace(
        /<testcase\s+([^>]*?)>([\s\S]*?)<\/testcase>/g,
        (testcaseMatch, testcaseAttrs, testcaseContent) => {
          // Skip if already has properties with test_key
          if (testcaseContent.includes('property name="test_key"')) {
            return testcaseMatch;
          }
          // Add test_key property at the beginning of content
          return `<testcase ${testcaseAttrs}>
      <properties>
        <property name="test_key" value="${testKey}"/>
      </properties>${testcaseContent}</testcase>`;
        }
      );
      
      // Then, handle self-closing testcases: <testcase ... />
      transformedContent = transformedContent.replace(
        /<testcase\s+([^>]*?)\/>/g,
        (testcaseMatch, testcaseAttrs) => {
          return `<testcase ${testcaseAttrs}>
      <properties>
        <property name="test_key" value="${testKey}"/>
      </properties>
    </testcase>`;
        }
      );
      
      return `<testsuite name="${testsuiteName}"${attrs}>${transformedContent}</testsuite>`;
    }
  );
  
  return transformed;
}

/**
 * Get summary of test keys found in the XML
 */
export function getTestKeySummary(xmlContent) {
  const testKeys = new Set();
  const regex = /<testsuite\s+name="([^"]+)"/g;
  let match;
  
  while ((match = regex.exec(xmlContent)) !== null) {
    const testKey = extractTestKey(match[1]);
    if (testKey) {
      testKeys.add(testKey);
    }
  }
  
  return Array.from(testKeys).sort();
}

