/**
 * Rate limiter for mutating endpoints.
 *
 * Defense-in-depth: even with the bearer secret, an attacker who obtains the
 * token (or anyone hammering /sync/run) is capped at a few requests per
 * minute. Each sync hits Postman + Xray APIs and writes to the DB, so we want
 * upper bounds.
 *
 * Per-IP keying assumes the bridge sits behind a single trusted proxy (LB or
 * CloudFront) -- `app.set('trust proxy', 1)` in server.js makes Express read
 * X-Forwarded-For from that one hop. If the deployment topology changes
 * (multiple proxies, no proxy), revisit the trust-proxy setting.
 *
 * The cron-driven sync calls syncService directly (not over HTTP), so it is
 * NOT subject to this limit.
 */

import rateLimit from 'express-rate-limit';

export const triggerRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute
  limit: 10,        // per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please retry in a moment.',
  },
});
