import * as jiraService from './jiraService.js';
import { config } from '../config.js';

/**
 * Test Resolver
 * Resolves logical test identifiers (SJP-2, ABC-3) to actual Jira keys (PF-11, PF-52)
 */

// In-memory cache
const cache = {
  tests: new Map(),
  testPlans: new Map()
};

/**
 * Extract collection prefix from test identifiers
 * @param {Array<string>} identifiers - Test identifiers like ['SJP-2', 'SJP-3', 'ABC-2']
 * @returns {string|null} - Prefix like 'SJP' or 'ABC'
 */
function extractPrefix(identifiers) {
  if (!identifiers || identifiers.length === 0) return null;
  
  // Extract prefix from first identifier (e.g., 'SJP-2' → 'SJP')
  const match = identifiers[0].match(/^([A-Z]+)-\d+/);
  return match ? match[1] : null;
}

/**
 * Resolve a test identifier to actual Jira key
 * @param {string} projectKey - Jira project key (e.g., 'PF')
 * @param {string} identifier - Logical identifier (e.g., 'SJP-2')
 * @param {string} summary - Test summary for creation
 * @returns {Promise<string>} - Actual Jira key (e.g., 'PF-11')
 */
async function resolveTestKey(projectKey, identifier, summary) {
  const cacheKey = `${projectKey}:${identifier}`;
  
  // Check cache
  if (cache.tests.has(cacheKey)) {
    return cache.tests.get(cacheKey);
  }
  
  console.log(`[TestResolver] Resolving ${identifier}...`);
  
  // Search Jira
  const existingTest = await jiraService.searchTestByIdentifier(projectKey, identifier);
  
  if (existingTest) {
    console.log(`[TestResolver] Found existing test: ${existingTest.key}`);
    cache.tests.set(cacheKey, existingTest.key);
    return existingTest.key;
  }
  
  // Create new test
  console.log(`[TestResolver] Creating new test for ${identifier}...`);
  const newTest = await jiraService.createTest(projectKey, identifier, summary || 'Test');
  console.log(`[TestResolver] Created: ${newTest.key}`);
  
  cache.tests.set(cacheKey, newTest.key);
  return newTest.key;
}

/**
 * Resolve Test Plan by prefix
 * @param {string} projectKey - Jira project key
 * @param {string} prefix - Collection prefix (e.g., 'SJP')
 * @param {string} name - Test Plan name
 * @returns {Promise<string>} - Test Plan key
 */
async function resolveTestPlanKey(projectKey, prefix, name) {
  const cacheKey = `${projectKey}:${prefix}:plan`;
  
  // Check cache
  if (cache.testPlans.has(cacheKey)) {
    return cache.testPlans.get(cacheKey);
  }
  
  console.log(`[TestResolver] Resolving Test Plan for prefix ${prefix}...`);
  
  // Search for Test Plan
  const existingPlan = await jiraService.searchTestPlanByPrefix(projectKey, prefix);
  
  if (existingPlan) {
    console.log(`[TestResolver] Found existing Test Plan: ${existingPlan.key}`);
    cache.testPlans.set(cacheKey, existingPlan.key);
    return existingPlan.key;
  }
  
  // Create new Test Plan
  console.log(`[TestResolver] Creating new Test Plan for ${prefix}...`);
  const newPlan = await jiraService.createTestPlan(projectKey, prefix, name || 'Test Plan');
  console.log(`[TestResolver] Created Test Plan: ${newPlan.key}`);
  
  cache.testPlans.set(cacheKey, newPlan.key);
  return newPlan.key;
}

/**
 * Resolve all test identifiers in XML to actual Jira keys
 * @param {string} xmlContent - JUnit XML content
 * @param {string} projectKey - Jira project key
 * @returns {Promise<Object>} - { keyMapping, prefix, testPlanKey }
 */
export async function resolveTestKeys(xmlContent, projectKey) {
  console.log('[TestResolver] Starting test key resolution...');
  
  // Extract all test identifiers from XML
  const identifiers = new Set();
  const regex = /<testsuite\s+name="([A-Z]+-\d+)[^"]*"/g;
  let match;
  
  while ((match = regex.exec(xmlContent)) !== null) {
    identifiers.add(match[1]);
  }
  
  const identifierArray = Array.from(identifiers);
  console.log(`[TestResolver] Found identifiers:`, identifierArray);
  
  if (identifierArray.length === 0) {
    console.log('[TestResolver] No test identifiers found, skipping resolution');
    return { keyMapping: {}, prefix: null, testPlanKey: null };
  }
  
  // Extract collection prefix
  const prefix = extractPrefix(identifierArray);
  console.log(`[TestResolver] Collection prefix: ${prefix}`);
  
  // Resolve Test Plan (if Jira API is configured)
  let testPlanKey = null;
  if (config.jira.email && config.jira.apiToken) {
    try {
      testPlanKey = await resolveTestPlanKey(projectKey, prefix, `${prefix} Tests`);
    } catch (error) {
      console.warn(`[TestResolver] Could not resolve Test Plan: ${error.message}`);
    }
  }
  
  // Resolve all test keys
  const keyMapping = {};
  
  for (const identifier of identifierArray) {
    try {
      // Extract test summary from XML if available
      const summaryMatch = xmlContent.match(
        new RegExp(`<testsuite\\s+name="${identifier}\\s*\\|\\s*([^"/]+)`)
      );
      const summary = summaryMatch ? summaryMatch[1].trim() : 'Test';
      
      const actualKey = await resolveTestKey(projectKey, identifier, summary);
      keyMapping[identifier] = actualKey;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[TestResolver] Failed to resolve ${identifier}: ${error.message}`);
      // Fall back to using identifier as-is
      keyMapping[identifier] = identifier;
    }
  }
  
  console.log('[TestResolver] Resolution complete:', keyMapping);
  
  return { keyMapping, prefix, testPlanKey };
}

/**
 * Clear resolver cache
 */
export function clearCache() {
  cache.tests.clear();
  cache.testPlans.clear();
}

