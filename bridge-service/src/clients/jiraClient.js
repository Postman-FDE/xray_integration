import { config } from '../config.js';

/**
 * Jira API Service
 * Handles searching and creating issues in Jira
 */

/**
 * Get Basic Auth header for Jira API
 */
function getAuthHeader() {
  const { email, apiToken } = config.jira;
  if (!email || !apiToken) {
    throw new Error('Jira credentials not configured. Set JIRA_EMAIL and JIRA_API_TOKEN.');
  }
  const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${authString}`;
}

/**
 * Search for a test by identifier in summary
 * @param {string} projectKey - Jira project key (e.g., 'PF')
 * @param {string} identifier - Test identifier to search for (e.g., 'SJP-2')
 * @returns {Promise<Object|null>} - Test issue or null if not found
 */
export async function searchTestByIdentifier(projectKey, identifier) {
  const { baseUrl } = config.jira;
  
  // Search for Test issues with identifier in summary
  const jql = `project = "${projectKey}" AND issuetype = Test AND summary ~ "${identifier}"`;
  
  console.log(`[JiraService] Searching: ${jql}`);
  
  // Use GET with JQL parameter - new endpoint with fields
  const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=key,summary`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[JiraService] Search failed (${response.status}): ${errorText.substring(0, 200)}`);
    return null;
  }
  
  const data = await response.json();
  
  // Return first match
  if (data.issues && data.issues.length > 0) {
    const test = data.issues[0];
    console.log(`[JiraService] Found existing test: ${test.key} - "${test.fields?.summary || 'N/A'}"`);
    return test;
  }
  
  console.log(`[JiraService] No existing test found for ${identifier}`);
  return null;
}

/**
 * Search for Test Plan by prefix
 * @param {string} projectKey - Jira project key
 * @param {string} prefix - Collection prefix (e.g., 'SJP')
 * @returns {Promise<Object|null>} - Test Plan issue or null
 */
export async function searchTestPlanByPrefix(projectKey, prefix) {
  const { baseUrl } = config.jira;
  
  const jql = `project = "${projectKey}" AND issuetype = "Test Plan" AND summary ~ "${prefix}*"`;
  
  console.log(`[JiraService] Searching Test Plan: ${jql}`);
  
  // Use GET with JQL parameter - new endpoint with fields
  const url = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=key,summary`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[JiraService] Test Plan search failed (${response.status}): ${errorText.substring(0, 200)}`);
    return null;
  }
  
  const data = await response.json();
  
  if (data.issues && data.issues.length > 0) {
    console.log(`[JiraService] Found existing Test Plan: ${data.issues[0].key}`);
    return data.issues[0];
  }
  
  console.log(`[JiraService] No existing Test Plan found for prefix ${prefix}`);
  return null;
}

/**
 * Create a test issue in Jira
 * @param {string} projectKey - Jira project key
 * @param {string} identifier - Test identifier (e.g., 'SJP-2')
 * @param {string} summary - Test summary
 * @returns {Promise<Object>} - Created test issue
 */
export async function createTest(projectKey, identifier, summary) {
  const { baseUrl } = config.jira;
  
  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: `${identifier}: ${summary}`,
      issuetype: { name: 'Test' }
    }
  };
  
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(issueData)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test: ${error}`);
  }
  
  return await response.json();
}

/**
 * Create a Test Plan in Jira
 * @param {string} projectKey - Jira project key
 * @param {string} prefix - Collection prefix
 * @param {string} name - Test Plan name
 * @returns {Promise<Object>} - Created test plan issue
 */
export async function createTestPlan(projectKey, prefix, name) {
  const { baseUrl } = config.jira;
  
  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: `${prefix} Test Plan: ${name}`,
      issuetype: { name: 'Test Plan' }
    }
  };
  
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(issueData)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test plan: ${error}`);
  }
  
  return await response.json();
}

