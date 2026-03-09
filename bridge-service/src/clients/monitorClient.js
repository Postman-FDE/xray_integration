/**
 * Monitor Client
 * 
 * Fetches monitor data from the Postman public API.
 * All endpoints use X-Api-Key authentication via config.postman.apiKey.
 * 
 * Public API endpoints:
 *   GET /monitors?collectionUid=xxx               - List monitors for a collection
 *   GET /monitors/:monitorId/executions            - List executions for a monitor
 *   GET /monitors/:monitorId/executions/:id/runs   - List runs for an execution
 *   GET /monitors/:monitorId/runs/:runId/results   - Get run results (trimmed logs)
 */

import config from '../config.js';

/**
 * Make authenticated request to Postman public API
 */
async function apiFetch(endpoint, options = {}) {
  const url = `${config.postman.apiUrl}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.postman.apiKey,
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Monitor API error (${response.status}): ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to Postman API at ${config.postman.apiUrl} - is the service running?`);
    }
    throw error;
  }
}

/**
 * Get monitors for a collection
 * 
 * @param {Object} options - Query options
 * @param {string} options.collectionId - Collection UID to filter by
 * @returns {Promise<Array>} - List of monitors
 */
export async function getMonitors(options = {}) {
  const { collectionId } = options;
  
  if (!collectionId) {
    throw new Error('collectionId is required');
  }
  
  const result = await apiFetch(`/monitors?collectionUid=${encodeURIComponent(collectionId)}`);
  return result.monitors || [];
}

/**
 * Get executions (jobs) for a monitor
 * 
 * @param {string} monitorId - Monitor ID
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (25 results per page)
 * @param {string} options.goto - Jump to executions around this timestamp
 * @returns {Promise<Object>} - { data: [...], meta: { page, nextPage, prevPage } }
 */
export async function getMonitorJobs(monitorId, options = {}) {
  const { page, goto } = options;
  
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (goto) params.set('goto', goto);
  
  const queryString = params.toString();
  const endpoint = `/monitors/${monitorId}/executions${queryString ? `?${queryString}` : ''}`;
  
  const result = await apiFetch(endpoint);
  return result;
}

/**
 * Get ALL executions for a monitor, handling pagination
 * 
 * Returns executions sorted OLDEST FIRST for proper checkpoint progression.
 * 
 * @param {string} monitorId - Monitor ID
 * @param {Object} options - Query options
 * @param {string} options.sinceTimestamp - Only get executions after this timestamp
 * @returns {Promise<Array>} - All executions, sorted oldest-first
 */
export async function getAllMonitorJobs(monitorId, options = {}) {
  const { sinceTimestamp } = options;
  const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : null;
  
  const allJobs = [];
  let cursor = undefined;
  let hasMore = true;
  
  while (hasMore) {
    const result = await getMonitorJobs(monitorId, { cursor });
    const jobs = result.data || [];
    const meta = result.meta || {};
    
    if (jobs.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const job of jobs) {
      const jobDate = new Date(job.finishedAt || job.createdAt);
      
      if (sinceDate && jobDate <= sinceDate) {
        hasMore = false;
        break;
      }
      
      allJobs.push(job);
    }
    
    hasMore = hasMore && meta.nextCursor != null && meta.nextCursor !== '';
    cursor = meta.nextCursor;
  }
  
  allJobs.sort((a, b) => {
    const dateA = new Date(a.finishedAt || a.createdAt);
    const dateB = new Date(b.finishedAt || b.createdAt);
    return dateA - dateB;
  });
  
  return allJobs;
}

/**
 * Get runs for an execution
 * 
 * @param {string} monitorId - Monitor ID
 * @param {string} executionId - Execution (job) ID
 * @returns {Promise<Array>} - List of runs
 */
export async function getJobRuns(monitorId, executionId) {
  const result = await apiFetch(`/monitors/${monitorId}/executions/${executionId}/runs`);
  return result.data || [];
}

/**
 * Get run results (trimmed logs with beforeItem + assertion events)
 * 
 * Use with monitorJsonToXrayJson.js transformer.
 * 
 * @param {string} monitorId - Monitor ID
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} - Run results with trimmed log events
 */
export async function getRunLog(monitorId, runId) {
  const result = await apiFetch(`/monitors/${monitorId}/runs/${runId}/results`);
  return result;
}

/**
 * Get test plan ID from monitor metadata
 * 
 * @param {Object} monitor - Monitor object
 * @returns {string|null} - Test plan ID or null
 */
export function getTestPlanId(monitor) {
  const collection = monitor.collection || {};
  const variable = collection.variable?.find(v => v.key === 'test-plan-id');
  return variable?.value || null;
}
