/**
 * Bearer-token auth for trigger / mutating endpoints.
 *
 * Caller must send: `Authorization: Bearer <BRIDGE_TRIGGER_SECRET>`.
 *
 * Fails closed: if no secret is configured, protected requests return 503
 * with a clear message. The bridge still starts (cron sync keeps running),
 * but no one can hit the trigger endpoints until a secret is set.
 *
 * Hitless rotation: set BRIDGE_TRIGGER_SECRET_PREVIOUS to the old value while
 * callers switch over; either token will be accepted during the cutover.
 *
 * Constant-time compare uses SHA-256 of both sides so even the *length* of
 * the secret is not leaked by early-exit timing.
 */

import crypto from 'crypto';
import { config } from '../config.js';

function constantTimeMatches(a, b) {
  const aHash = crypto.createHash('sha256').update(a).digest();
  const bHash = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

export function requireBridgeSecret(req, res, next) {
  const validSecrets = [
    config.bridge.triggerSecret,
    config.bridge.triggerSecretPrevious,
  ].filter((s) => typeof s === 'string' && s.length > 0);

  if (validSecrets.length === 0) {
    return res.status(503).json({
      error:
        'Bridge trigger secret is not configured. Set BRIDGE_TRIGGER_SECRET to enable this endpoint.',
    });
  }

  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return res.status(401).json({
      error:
        'Missing or malformed Authorization header. Expected: Authorization: Bearer <token>',
    });
  }

  const provided = match[1].trim();

  for (const secret of validSecrets) {
    if (constantTimeMatches(provided, secret)) {
      return next();
    }
  }

  return res.status(403).json({ error: 'Invalid bridge token.' });
}
