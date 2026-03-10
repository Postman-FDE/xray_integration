/**
 * Postman API Client
 * 
 * Authenticated fetch helper and collection-related endpoints.
 * The fetch helper is shared with monitorClient.js.
 */

import { config } from '../config.js';

/** Authenticated fetch to Postman API. Shared by postmanClient and monitorClient. */
export async function postmanFetch(endpoint) {
  if (!config.postman.apiKey) {
    throw new Error('PM_API_KEY not configured');
  }

  const url = `${config.postman.apiUrl}${endpoint}`;

  const response = await fetch(url, {
    headers: { 'X-Api-Key': config.postman.apiKey }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Postman API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** List all collections in a workspace. */
export async function getCollections(workspaceId) {
  const data = await postmanFetch(`/collections?workspace=${workspaceId}`);
  return data.collections || [];
}

/** Get a single collection's details (variables, items/folders). */
export async function getCollection(collectionUid) {
  const data = await postmanFetch(`/collections/${collectionUid}`);
  const collection = data.collection || {};
  return {
    uid: collectionUid,
    name: collection.info?.name,
    variable: collection.variable || [],
    item: collection.item || []
  };
}

/** List all collections in a workspace with their variables and items populated. */
export async function getCollectionsWithVariables(workspaceId) {
  const collections = await getCollections(workspaceId);
  return Promise.all(
    collections.map(async (c) => {
      try {
        const details = await getCollection(c.uid);
        return { ...c, variable: details.variable, item: details.item };
      } catch (error) {
        console.warn(`Failed to fetch collection ${c.name || c.uid}: ${error.message}`);
        return { ...c, variable: [], item: [] };
      }
    })
  );
}

/** Filter collections to only those with a test-plan-id variable (Xray-linked). */
export function filterXrayLinkedCollections(collections) {
  return collections.filter(c =>
    c.variable?.some(v => v.key === 'test-plan-id')
  );
}
