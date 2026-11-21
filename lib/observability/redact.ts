const SENSITIVE = /password|passwd|token|secret|authorization|cookie|api.?key|email|^to$|subject|dedupekey|bizno|accountno|cardfees|phone|ip_address|사업자번호|계좌|카드수수료/i;

export function redactText(value: string): string {
  return value
    .replace(/https:\/\/hooks\.slack\.com\/services\/[^\s"'<>]+/gi, '[Filtered]')
    .replace(/\b(Bearer|Basic)\s+[a-z0-9._~+\/=-]+/gi, '$1 [Filtered]')
    .replace(/((?:postgres(?:ql)?|redis|https?):\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[Filtered]@')
    .replace(/([?&](?:token|secret|password|key|code|signature)=)[^\s&#"']*/gi, '$1[Filtered]')
    .replace(/((?:token|secret|password|passwd|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, '$1[Filtered]')
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[Email]')
    .slice(0, 4000);
}

/** Bounded traversal; free-text business identifiers still must not be logged at source. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object') return value;
  if (depth > 12 || seen.has(value)) return '[Truncated]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactText(value.message), stack: value.stack && redactText(value.stack) };
  if (Array.isArray(value)) return value.slice(0, 100).map(v => redact(v, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, val]) => [key, SENSITIVE.test(key) ? '[Filtered]' : redact(val, depth + 1, seen)]));
}

export function scrubEvent<T extends object>(event: T): T {
  return redact(event) as T;
}
