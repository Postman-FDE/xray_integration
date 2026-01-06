/**
 * Postman API Service
 * 
 * Handles communication with Postman API to fetch collections and runs.
 * 
 * Real APIs:
 *   - GET /collections?workspace={id} - List collections (real)
 *   - GET /collections/{uid} - Get collection details with variables (real)
 * 
 * Mocked APIs (don't exist yet):
 *   - GET /collections/{uid}/runs - List runs for a collection
 *   - GET /collections/{uid}/runs/{runId} - Get run results
 */

import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTMAN_API_BASE = 'https://api.getpostman.com';

// Mock server for APIs that don't exist yet (collection runs)
// TODO: Remove when real Postman API endpoints are available
const POSTMAN_MOCK_BASE = process.env.POSTMAN_MOCK_URL || 'https://be57294f-23b9-486c-b932-bcaf691d852e.mock.pstmn.io';

/**
 * Make authenticated request to Postman API
 * @param {boolean} silent - If true, don't log the request
 */
async function postmanFetch(endpoint, { silent = false } = {}) {
  if (!config.postmanApiKey) {
    throw new Error('POSTMAN_API_KEY not configured');
  }

  const url = `${POSTMAN_API_BASE}${endpoint}`;
  // Only log if not silent
  if (!silent) {
    console.log(`  GET ${url}`);
  }

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': config.postmanApiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Postman API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get all collections in a workspace
 * 
 * API: GET https://api.getpostman.com/collections?workspace={workspaceId}
 * 
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} - List of collections (without variables)
 */
export async function getCollections(workspaceId) {
  const data = await postmanFetch(`/collections?workspace=${workspaceId}`, { silent: true });
  
  // API returns { collections: [...] }
  return data.collections || [];
}

/**
 * Get collection details including variables
 * 
 * API: GET https://api.getpostman.com/collections/{collectionUid}
 * 
 * @param {string} collectionUid - Collection UID
 * @returns {Promise<Object>} - Collection details with variables
 */
export async function getCollection(collectionUid) {
  const data = await postmanFetch(`/collections/${collectionUid}`, { silent: true });
  
  // API returns { collection: { info: {...}, item: [...], variable: [...] } }
  const collection = data.collection || {};
  
  return {
    uid: collectionUid,
    name: collection.info?.name,
    variable: collection.variable || [],
    item: collection.item || []
  };
}

/**
 * Get collections with their variables (requires fetching each one)
 * 
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Array>} - Collections with variables populated
 */
export async function getCollectionsWithVariables(workspaceId) {
  // Step 1: Get list of collections (no variables in this response)
  const collections = await getCollections(workspaceId);
  
  // Step 2: Fetch each collection to get variables
  console.log(`Fetching details for ${collections.length} collections...`);
  
  const collectionsWithVars = await Promise.all(
    collections.map(async (c) => {
      try {
        const details = await getCollection(c.uid);
        return {
          ...c,
          variable: details.variable,
          item: details.item
        };
      } catch (error) {
        console.warn(`  ⚠ Failed to fetch ${c.name || c.uid}`);
        return { ...c, variable: [], item: [] };
      }
    })
  );
  
  return collectionsWithVars;
}

// ============================================================================
// getCollectionRuns - Calls mock server (will be real API later)
// ============================================================================
/**
 * Get runs for a collection (paginated)
 * 
 * ⚠️ Currently calls mock server - will be replaced with real Postman API
 * 
 * Expected API: GET /collections/{uid}/runs
 * 
 * @param {string} collectionUid - Collection UID
 * @param {Object} options - Query options
 * @param {string} options.sinceTimestamp - ISO timestamp, fetch runs completed AFTER this time
 * @param {number} options.limit - Max runs to return
 * @returns {Promise<Object>} - { runs: [], nextCursor: null }
 */
export async function getCollectionRuns(collectionUid, options = {}) {
  const { sinceTimestamp, limit = 10 } = options;
  
  try {
    // Call mock endpoint (will be replaced with real API later)
    const url = `${POSTMAN_MOCK_BASE}/collections/${collectionUid}/runs`;
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': config.postmanApiKey || '',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Mock API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Handle mock response format: { runs: [...] }
    const allRuns = data.runs || [];
    
    // Filter runs by completedAt timestamp (if 'sinceTimestamp' provided)
    // Only include runs that completed AFTER the given timestamp
    const newRuns = sinceTimestamp 
      ? allRuns.filter(r => {
          const runCompletedAt = r.completedAt;
          if (!runCompletedAt) return true; // Include if no timestamp (shouldn't happen)
          return new Date(runCompletedAt) > new Date(sinceTimestamp);
        })
      : allRuns;
    
    return {
      runs: newRuns.slice(0, limit),
      allRunsCount: allRuns.length,
      nextCursor: data.nextCursor || null
    };
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// getRunResults - Calls mock server (will be real API later)
// ============================================================================
/**
 * Get run results/details
 * 
 * ⚠️ Currently calls mock server - will be replaced with real Postman API
 * 
 * Expected API: GET /collections/{uid}/runs/{runId}
 * 
 * @param {string} collectionUid - Collection UID
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} - Run results in JSON format
 */
export async function getRunResults(collectionUid, runId) {
  try {
    // Call mock endpoint (will be replaced with real API later)
    const url = `${POSTMAN_MOCK_BASE}/collections/${collectionUid}/runs/${runId}`;
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': config.postmanApiKey || '',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Mock API error: ${response.status} ${response.statusText}`);
    }
    
    const results = await response.json();
    
    // Add runId if not present
    return {
      runId,
      collectionUid,
      ...results
    };
  } catch (error) {
    // Fallback to local file if mock fails
    const mockFilePath = path.join(__dirname, '../../test-results/postman-cli/loanflow-results.json');
    
    try {
      const fileContent = fs.readFileSync(mockFilePath, 'utf-8');
      const results = JSON.parse(fileContent);
      console.log(`      (using local fallback file)`);
      return { runId, collectionUid, ...results };
    } catch (fileError) {
      throw error; // Throw original error
    }
  }
}

/**
 * Filter collections that have test-plan-id variable
 * @param {Array} collections - List of collections
 * @returns {Array} - Filtered collections linked to Xray
 */
export function filterXrayLinkedCollections(collections) {
  return collections.filter(c => 
    c.variable?.some(v => v.key === 'test-plan-id')
  );
}

/**
 * Get test-plan-id from collection variables
 * @param {Object} collection - Collection object
 * @returns {string|null} - Test plan ID or null
 */
export function getTestPlanId(collection) {
  const variable = collection.variable?.find(v => v.key === 'test-plan-id');
  return variable?.value || null;
}

/**
 * Build a map of request ID → folder name
 * This is needed because Postman CLI JSON doesn't include folder names directly.
 * The folder name contains the test_key (e.g., "SJP-2 | Create Loan")
 * 
 * @param {Object} collection - Collection object with item array
 * @returns {Object} - Map of request ID to folder name
 */
export function buildFolderMap(collection) {
  const folderMap = {};
  
  if (!collection.item || !Array.isArray(collection.item)) {
    return folderMap;
  }
  
  // Iterate through folders (top-level items that have nested items)
  for (const folder of collection.item) {
    const folderName = folder.name;
    
    // Check if this is a folder (has nested items)
    if (folder.item && Array.isArray(folder.item)) {
      for (const request of folder.item) {
        if (request.id) {
          folderMap[request.id] = folderName;
        }
      }
    }
  }
  
  return folderMap;
}

