/**
 * Monitor Service
 * 
 * Fetches monitor runs from Postman internal APIs (newman-remote-api).
 * 
 * API Hierarchy:
 *   jobtemplate = monitor configuration
 *   job = a scheduled/triggered execution of the monitor
 *   run = actual execution result
 *   log = detailed execution results (test assertions, etc.)
 * 
 * Endpoints:
 *   GET /jobtemplates?collection=xxx&active=true    - List monitors
 *   GET /jobtemplates/:jobTemplateId/jobs           - List jobs for a monitor
 *   GET /jobs/:jobId/runs                           - List runs for a job
 *   GET /runs/:runId/log                            - Get run log/details
 */

import config from '../config.js';

/**
 * Make authenticated request to Monitor API
 */
async function monitorFetch(endpoint, options = {}) {
  const url = `${config.monitor.apiUrl}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': config.monitor.accessToken,
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
      throw new Error(`Cannot connect to Monitor API at ${config.monitor.apiUrl} - is the service running?`);
    }
    throw error;
  }
}

/**
 * Get monitors (jobtemplates) for a collection or workspace
 * 
 * @param {Object} options - Query options
 * @param {string} options.collectionId - Collection ID to filter by
 * @param {string} options.workspaceId - Workspace ID (not directly supported by API, see note)
 * @param {boolean} options.active - Only active monitors (default: true)
 * @returns {Promise<Array>} - List of monitors
 * 
 * Note: The API filters by collection, not workspace. 
 * To get all monitors in a workspace, we'd need to first list collections in the workspace.
 * For now, collectionId is required.
 */
export async function getMonitors(options = {}) {
  const { collectionId, active = true } = options;
  
  if (!collectionId) {
    // TODO: If only workspaceId is provided, we need to:
    // 1. List collections in workspace
    // 2. For each collection, get monitors
    throw new Error('collectionId is required - workspace-level monitor listing not implemented yet');
  }
  
  const params = new URLSearchParams();
  params.set('collection', collectionId);
  if (active) params.set('active', 'true');
  
  const result = await monitorFetch(`/jobtemplates?${params}`);
  
  // API returns { data: [...] } or just [...]
  return result.data || result;
}

/**
 * Get jobs for a monitor (jobtemplate)
 * 
 * Supports pagination (25 per page) and timestamp-based filtering via `goto`
 * 
 * @param {string} monitorId - Monitor/JobTemplate ID
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (25 results per page)
 * @param {string} options.goto - Jump to jobs around this timestamp
 * @returns {Promise<Array>} - List of jobs
 */
export async function getMonitorJobs(monitorId, options = {}) {
  const { page, goto } = options;
  
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (goto) params.set('goto', goto);
  
  const queryString = params.toString();
  const endpoint = `/jobtemplates/${monitorId}/jobs${queryString ? `?${queryString}` : ''}`;
  
  const result = await monitorFetch(endpoint);
  return result.data || result;
}

/**
 * Get ALL jobs for a monitor, handling pagination
 * 
 * Returns jobs sorted OLDEST FIRST for proper checkpoint progression.
 * (API returns newest-first, we reverse for monotonic timestamp updates)
 * 
 * @param {string} monitorId - Monitor/JobTemplate ID  
 * @param {Object} options - Query options
 * @param {string} options.sinceTimestamp - Only get jobs after this timestamp
 * @returns {Promise<Array>} - All jobs, sorted oldest-first
 */
export async function getAllMonitorJobs(monitorId, options = {}) {
  const { sinceTimestamp } = options;
  const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : null;
  
  const allJobs = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const jobs = await getMonitorJobs(monitorId, { page });
    
    if (jobs.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const job of jobs) {
      const jobDate = new Date(job.finishedAt || job.createdAt);
      
      // Jobs are sorted by createdAt desc, so once we hit older jobs, stop
      if (sinceDate && jobDate <= sinceDate) {
        hasMore = false;
        break;
      }
      
      allJobs.push(job);
    }
    
    // If we got less than 25, we've reached the end
    if (jobs.length < 25) {
      hasMore = false;
    }
    
    page++;
  }
  
  // Sort oldest-first for proper checkpoint progression
  // This ensures timestamp updates are monotonically increasing
  allJobs.sort((a, b) => {
    const dateA = new Date(a.finishedAt || a.createdAt);
    const dateB = new Date(b.finishedAt || b.createdAt);
    return dateA - dateB;  // Ascending (oldest first)
  });
  
  return allJobs;
}

/**
 * Get runs for a job
 * 
 * @param {string} jobId - Job ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - List of runs
 */
export async function getJobRuns(jobId, options = {}) {
  const result = await monitorFetch(`/jobs/${jobId}/runs`);
  return result.data || result;
}

/**
 * Get detailed results/log for a run
 * 
 * @param {string} monitorId - Monitor ID (not used, kept for interface consistency)
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} - Run log with execution details
 */
export async function getRunResults(monitorId, runId) {
  const result = await monitorFetch(`/runs/${runId}/log`);
  return result;
}

/**
 * Get test plan ID from monitor metadata
 * 
 * @param {Object} monitor - Monitor object
 * @returns {string|null} - Test plan ID or null
 */
export function getTestPlanId(monitor) {
  // Check monitor's collection variables for test-plan-id
  // The structure depends on how the monitor stores collection data
  const collection = monitor.collection || {};
  const variable = collection.variable?.find(v => v.key === 'test-plan-id');
  return variable?.value || null;
}
