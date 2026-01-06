import { config } from '../config.js';

/**
 * Cache for the auth token
 */
let authToken = null;
let tokenExpiry = null;

/**
 * Authenticate with Xray Cloud API
 * Returns a Bearer token valid for a limited time
 */
export async function authenticate() {
  // Return cached token if still valid (with 5 min buffer)
  if (authToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return authToken;
  }

  const { clientId, clientSecret, baseUrl } = config.xray;

  if (!clientId || !clientSecret) {
    throw new Error('Xray credentials not configured. Set XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.');
  }

  const response = await fetch(`${baseUrl}/api/v2/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xray authentication failed: ${response.status} - ${errorText}`);
  }

  // Response is just the token string (with quotes)
  const token = await response.text();
  authToken = token.replace(/"/g, ''); // Remove surrounding quotes
  
  // Token is valid for ~1 hour, set expiry to 55 minutes from now
  tokenExpiry = Date.now() + 55 * 60 * 1000;

  return authToken;
}

/**
 * Import JUnit XML results to Xray
 * 
 * @param {Buffer|string} xmlContent - The JUnit XML content
 * @param {object} options - Import options
 * @param {string} options.projectKey - Jira project key (e.g., 'SJP')
 * @param {string} options.testPlanKey - Test plan issue key (e.g., 'SJP-1')
 * @param {string} options.testExecKey - Existing test execution key (optional)
 * @param {string} options.revision - Source code revision (optional)
 * @param {string} options.testEnvironments - Test environments (optional)
 */
export async function importJUnitResults(xmlContent, options = {}) {
  const token = await authenticate();
  const { baseUrl } = config.xray;

  // Build query params
  const params = new URLSearchParams();
  if (options.projectKey) params.append('projectKey', options.projectKey);
  if (options.testPlanKey) params.append('testPlanKey', options.testPlanKey);
  if (options.testExecKey) params.append('testExecKey', options.testExecKey);
  if (options.revision) params.append('revision', options.revision);
  if (options.testEnvironments) params.append('testEnvironments', options.testEnvironments);

  const queryString = params.toString();
  const url = `${baseUrl}/api/v2/import/execution/junit${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/xml',
    },
    body: xmlContent,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xray import failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Import Xray JSON results to Xray
 * 
 * @param {object} payload - The Xray JSON payload
 * @returns {object} - Import result with test execution key
 */
export async function importXrayJson(payload) {
  const token = await authenticate();
  const { baseUrl } = config.xray;

  const url = `${baseUrl}/api/v2/import/execution`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Xray import failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Clear cached auth token (useful for testing or re-auth)
 */
export function clearAuthCache() {
  authToken = null;
  tokenExpiry = null;
}

