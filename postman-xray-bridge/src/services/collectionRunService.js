/**
 * Collection Run Service
 * 
 * Fetches collection runs from Postman internal APIs (history-service).
 * This covers runs triggered via CLI or manually (not monitors).
 * 
 * Endpoints (to be configured):
 *   - GET collection runs (with timestamp filter)
 *   - GET run results/details
 */

import config from '../config.js';

/**
 * Make authenticated request to Collection Run API
 */
async function collectionRunFetch(endpoint, options = {}) {
  const url = `${config.collectionRun.apiUrl}${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication headers as needed
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Collection Run API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get runs for a collection
 * 
 * TODO: Fill in actual endpoint
 * 
 * @param {string} collectionId - Collection ID
 * @param {Object} options - Query options
 * @param {string} options.sinceTimestamp - Fetch runs after this timestamp
 * @param {number} options.limit - Max runs to return
 * @returns {Promise<Object>} - { runs: [], total: number }
 */
export async function getCollectionRuns(collectionId, options = {}) {
  // TODO: Implement with real endpoint
  // Example: GET /collections/{id}/runs?since=xxx
  throw new Error('Not implemented - need endpoint details');
}

/**
 * Get detailed results for a specific run
 * 
 * TODO: Fill in actual endpoint
 * 
 * @param {string} collectionId - Collection ID
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} - Run results with execution details
 */
export async function getRunResults(collectionId, runId) {
  // TODO: Implement with real endpoint
  // Example: GET /collections/{id}/runs/{runId}
  throw new Error('Not implemented - need endpoint details');
}

/**
 * Get test plan ID from collection metadata
 * 
 * @param {Object} collection - Collection object with variables
 * @returns {string|null} - Test plan ID or null
 */
export function getTestPlanId(collection) {
  const variable = collection.variable?.find(v => v.key === 'test-plan-id');
  return variable?.value || null;
}
