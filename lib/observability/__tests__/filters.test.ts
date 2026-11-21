import { describe, expect, it } from 'vitest';
import { kstInput, parseFilters, queryWindow } from '../filters';
import { redact, redactText } from '../redact';

const now = new Date('2026-11-17T03:00:00Z');
describe('observability input boundaries', () => {
  it('KST 종료 시각과 최대 7일 조회 범위를 UTC로 변환한다', () => {
    const filters = parseFilters({ until: '2026-11-17T11:00', range: '7d' }, now);
    expect(filters.until).toBe('2026-11-17T02:00:00.000Z');
    expect(kstInput(filters.until)).toBe('2026-11-17T11:00');
    expect(queryWindow(filters, now)).toEqual({ start: '2026-11-10T02:00:00.000Z', end: '2026-11-17T02:00:00.000Z', step: 2520 });
  });
  it.each([{ until: '2026-11-18T11:00' }, { until: '2026-02-30T11:00' }, { range: '30d' }, { view: 'sql' }, { q: 'a\nb' }, { q: 'a'.repeat(121) }, { source: ['loki', 'sentry'] }])('잘못된 조회 조건을 거부한다: %j', input => {
    expect(() => parseFilters(input, now)).toThrow();
  });
  it('JSON·텍스트·Error 안의 비밀값과 이메일을 마스킹한다', () => {
    const secret = { token: 'abc123', nested: { email: 'test@example.com', err: new Error('password=topsecret') }, message: 'Bearer abcd.1234 https://user:password@example.com/x' };
    const result = JSON.stringify(redact(secret));
    expect(result).not.toMatch(/abc123|test@example.com|topsecret|abcd.1234|user:password/);
    expect(result).toContain('[Filtered]');
    expect(redactText('cookie=session=abc123')).not.toContain('abc123');
  });
  it('순환 참조와 너무 긴 메시지를 제한한다', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(redact(cycle)).toEqual({ self: '[Truncated]' });
    expect(redactText('x'.repeat(5000))).toHaveLength(4000);
  });
});
