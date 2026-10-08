import { expect, it } from 'vitest';
import { storedMatchingPolicySchema, parseMatchingFeesForm } from '../pg-matching-policy';
const empty = { sole: null, sme1: null, sme2: null, sme3: null, general: null };
it('구형 정책의 후보와 조건을 보존하고 최저·최고를 판가로 변환하지 않는다', () => {
 const candidate = { pgWorkspaceId: '20000000-0000-4000-8000-000000000001', reason: '상담', feeMin: 0.8, feeMax: 0.9, feeNote: '카드' };
 expect(storedMatchingPolicySchema.parse({ risk: 'white', candidates: [candidate] })).toEqual({ risk: 'white', candidates: [{ pgWorkspaceId: candidate.pgWorkspaceId, reason: '상담', feesByTier: empty, feeNote: '카드' }] });
});
it('폼의 빈 값과 0%를 구분하고 모든 등급을 파싱한다', () => {
 const form = new FormData();
 form.set('pg:sole', '0'); form.set('pg:sme1', '1.2'); form.set('pg:sme2', '2'); form.set('pg:sme3', '3'); form.set('pg:general', '100');
 expect(parseMatchingFeesForm(form, 'pg')).toEqual({ sole: 0, sme1: 1.2, sme2: 2, sme3: 3, general: 100 });
 expect(parseMatchingFeesForm(new FormData(), 'pg')).toEqual(empty);
});
