/**
 * Configuration for postman-xray-bridge
 * 
 * All environment variables are centralized here.
 * 
 * Required:
 *   XRAY_CLIENT_ID - Your Xray Cloud API client ID
 *   XRAY_CLIENT_SECRET - Your Xray Cloud API client secret
 *   BRIDGE_TRIGGER_SECRET - Shared secret required to call mutating endpoints
 *                           (POST /sync/run, /sync/junit, /scheduler/start|stop).
 *                           Without it, those endpoints return 503.
 * 
 * Optional:
 *   BRIDGE_TRIGGER_SECRET_PREVIOUS - Old secret, accepted alongside the current
 *                                    one to enable hitless rotation.
 *   XRAY_BASE_URL - Xray Cloud base URL (default: https://xray.cloud.getxray.app)
 *   PM_API_KEY - Your Postman API key
 *   POSTMAN_API_URL - Postman API base URL (default: https://api.getpostman.com)
 *   POSTMAN_WORKSPACE_IDS - Comma-separated workspace IDs (e.g., ws-id-1,ws-id-2)
 *   SYNC_CRON - Cron expression (default: every hour)
 *   SYNC_ENABLED - Enable auto-sync on startup (default: false)
 *   SYNC_BASE_TIME - Only sync runs after this timestamp
 *   PORT - Server port (default: 3003)
 */

export const config = {
  // Database settings
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // Xray Cloud API settings
  xray: {
    clientId: process.env.XRAY_CLIENT_ID || '',
    clientSecret: process.env.XRAY_CLIENT_SECRET || '',
    baseUrl: process.env.XRAY_BASE_URL || 'https://xray.cloud.getxray.app',
  },

  // Bridge inbound auth (shared secret for mutating endpoints)
  bridge: {
    triggerSecret: process.env.BRIDGE_TRIGGER_SECRET || '',
    triggerSecretPrevious: process.env.BRIDGE_TRIGGER_SECRET_PREVIOUS || '',
  },

  // Postman Public API settings
  postman: {
    apiKey: process.env.PM_API_KEY || '',
    apiUrl: process.env.POSTMAN_API_URL || 'https://api.getpostman.com',
    workspaceIds: (process.env.POSTMAN_WORKSPACE_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0),
  },

  // Sync job settings
  sync: {
    enabled: process.env.SYNC_ENABLED === 'true',
    cronExpression: process.env.SYNC_CRON || '0 * * * *',
    baseTime: process.env.SYNC_BASE_TIME || null,
  },

  // Server settings
  server: {
    port: parseInt(process.env.PORT || '3003', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const missing = [];

  if (!config.xray.clientId) {
    missing.push('XRAY_CLIENT_ID');
  }
  if (!config.xray.clientSecret) {
    missing.push('XRAY_CLIENT_SECRET');
  }

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('   Xray sync will fail until these are configured.');
  }

  if (!config.bridge.triggerSecret) {
    console.warn(
      '⚠️  BRIDGE_TRIGGER_SECRET not set. Protected endpoints (/sync/*, /scheduler/*) will return 503 until configured.'
    );
  } else if (config.bridge.triggerSecret.length < 32) {
    console.warn(
      `⚠️  BRIDGE_TRIGGER_SECRET is shorter than 32 characters (${config.bridge.triggerSecret.length}). Use a high-entropy value -- e.g. \`openssl rand -hex 32\`.`
    );
  }

  return missing.length === 0;
}


