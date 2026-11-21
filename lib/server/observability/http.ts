import 'server-only';
import type { Result } from '@/lib/observability/types';

export class NotConfigured extends Error {}
export class UpstreamError extends Error {
  constructor(public status: number) { super('Observability upstream failed'); }
}

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new NotConfigured();
  return value;
}

export function endpoint(base: string, path: string): URL {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid endpoint');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  return url;
}

export function basic(user: string, token: string): string {
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;
}

/** No redirects, browser cache, unbounded body, upstream error text, or token leakage. */
export async function fetchJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel(); throw new UpstreamError(response.status); }
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}

export async function attempt<T>(work: () => Promise<T>): Promise<Result<T>> {
  try { return { state: 'ready', data: await work() }; }
  catch (error) {
    if (error instanceof NotConfigured) return { state: 'unconfigured', message: '아직 연결되지 않은 수집원입니다. 운영 설정을 완료하면 데이터를 볼 수 있습니다.' };
    return { state: 'error', message: error instanceof UpstreamError && error.status === 429
      ? '조회 한도에 도달했습니다. 잠시 후 다시 조회해 주세요.'
      : '데이터를 불러오지 못했습니다. 연결 상태와 조회 권한을 확인해 주세요.' };
  }
}

export function environment(): string {
  const value = process.env.OBSERVABILITY_ENVIRONMENT?.trim() || 'production';
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(value)) throw new Error('Invalid environment');
  return value;
}
