/**
 * Monitor Client
 * 
 * Fetches monitor data from the Postman public API.
 * Uses shared postmanFetch helper from postmanClient.js.
 */

import { postmanFetch } from './postmanClient.js';

/** List monitors for a collection. */
export async function getMonitors({ collectionId }) {
  if (!collectionId) throw new Error('collectionId is required');
  const result = await postmanFetch(`/monitors?collectionUid=${encodeURIComponent(collectionId)}`);
  return result.monitors || [];
}

/** Get a single page of executions for a monitor. Supports cursor pagination. */
export async function getMonitorJobs(monitorId, options = {}) {
  const { cursor } = options;
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const queryString = params.toString();
  const result = await postmanFetch(`/monitors/${monitorId}/executions${queryString ? `?${queryString}` : ''}`);
  return result;
}

/** Get ALL executions for a monitor, handling pagination. Returns oldest-first for checkpoint progression. */
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

  allJobs.sort((a, b) => new Date(a.finishedAt || a.createdAt) - new Date(b.finishedAt || b.createdAt));
  return allJobs;
}

/** Get runs for an execution. */
export async function getJobRuns(monitorId, executionId) {
  const result = await postmanFetch(`/monitors/${monitorId}/executions/${executionId}/runs`);
  return result.data || [];
}

/** Get run results (trimmed logs with beforeItem + assertion events). */
export async function getRunLog(monitorId, runId) {
  return postmanFetch(`/monitors/${monitorId}/runs/${runId}/results`);
}
