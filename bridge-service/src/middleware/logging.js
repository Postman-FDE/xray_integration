/**
 * Request logging middleware
 */
export function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const { method, path } = req;

  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;

    const statusColor =
      status >= 500
        ? '\x1b[31m'
        : status >= 400
          ? '\x1b[33m'
          : status >= 300
            ? '\x1b[36m'
            : '\x1b[32m';

    const resetColor = '\x1b[0m';

    console.log(
      `${new Date().toISOString()} | ${method.padEnd(7)} ${path.padEnd(40)} | ${statusColor}${status}${resetColor} | ${duration}ms`
    );

    originalEnd.apply(res, args);
  };

  next();
}

