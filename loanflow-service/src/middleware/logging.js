/**
 * Request logging middleware
 * Logs: method, path, status code, and response duration
 */
export function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const { method, path } = req;

  // Capture the original end function
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;

    const statusColor =
      status >= 500
        ? '\x1b[31m' // Red for 5xx
        : status >= 400
          ? '\x1b[33m' // Yellow for 4xx
          : status >= 300
            ? '\x1b[36m' // Cyan for 3xx
            : '\x1b[32m'; // Green for 2xx

    const resetColor = '\x1b[0m';

    console.log(
      `${new Date().toISOString()} | ${method.padEnd(7)} ${path.padEnd(40)} | ${statusColor}${status}${resetColor} | ${duration}ms`
    );

    // Call the original end function
    originalEnd.apply(res, args);
  };

  next();
}

