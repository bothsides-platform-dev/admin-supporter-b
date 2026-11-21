import { redact, redactText } from './redact';

/** One JSON record per line for PM2 → Alloy. No request body or credentials. */
export function logServer(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ...redact(fields) as Record<string, unknown>, time: new Date().toISOString(), level, service: 'admin', msg: redactText(message) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
