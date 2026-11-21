import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ captureRequestError }, { logServer }] = await Promise.all([
    import('@sentry/nextjs'), import('./lib/observability/logger'),
  ]);
  // Route pattern instead of actual URL/query or request headers.
  logServer('error', 'request.failed', { err: error, route: context.routePath, method: request.method });
  captureRequestError(error, { ...request, path: context.routePath, headers: {} }, context);
};
