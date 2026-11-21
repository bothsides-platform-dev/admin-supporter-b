import * as Sentry from '@sentry/nextjs';
import { scrubEvent } from '@/lib/observability/redact';

// Optional error ingestion, distinct from the read token used by the admin UI.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    environment: process.env.OBSERVABILITY_ENVIRONMENT || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      const clean = scrubEvent(event);
      delete clean.user;
      if (clean.request) clean.request = { method: clean.request.method, url: clean.request.url?.split(/[?#]/, 1)[0] };
      return clean;
    },
    beforeBreadcrumb: breadcrumb => scrubEvent(breadcrumb),
  });
}
