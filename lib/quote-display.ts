import { formatKRW, formatPct } from './utils';

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function v2Terms(value: unknown): Record<string, unknown> | null {
  const terms = record(value);
  return terms._v === 2 ? terms : null;
}
export function conditionText(value: unknown, unit: 'money' | 'rate' = 'money'): string {
  const term = record(value);
  if (term.state === 'negotiable') return '협의 필요';
  if (term.state === 'not_applicable') return '해당 없음';
  if (term.state === 'confirmed' && typeof term.value === 'number' && Number.isFinite(term.value) && term.value >= 0)
    return unit === 'money' ? formatKRW(term.value) : formatPct(term.value, 6).replace(/\.?0+%$/, '%');
  return '미입력';
}
export function costText(terms: unknown, key: string, legacy: number | null): string {
  const v2 = v2Terms(terms);
  return v2 ? conditionText(v2[key]) : legacy === null ? '미입력' : formatKRW(legacy);
}
