// Storage contract shared by admin-supporter-b and bidit. Rates are percentages (1.2 = 1.2%).
import { z } from 'zod';
import { MERCHANT_TIERS } from '@/lib/types/bid';

export const matchingFeesSchema = z.record(z.enum(MERCHANT_TIERS), z.number().min(0).max(100).nullable());
export const emptyMatchingFees = () => Object.fromEntries(MERCHANT_TIERS.map(tier => [tier, null])) as z.infer<typeof matchingFeesSchema>;
const identity = {
  pgWorkspaceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
  feeNote: z.string().trim().max(300),
};
const candidateSchema = z.object({ ...identity, feesByTier: matchingFeesSchema }).strict()
  .refine(c => Object.values(c.feesByTier).every(fee => fee === null) || c.feeNote.length > 0,
    '요율과 적용 조건을 확인해주세요');
const legacyCandidateSchema = z.object({
  ...identity,
  feeMin: z.number().min(0).max(100).nullable(),
  feeMax: z.number().min(0).max(100).nullable(),
}).strict();
const policyFields = { risk: z.enum(['unconfigured', 'white', 'gray', 'black']) };
const uniqueCandidates = (p: { candidates: { pgWorkspaceId: string }[] }) => new Set(p.candidates.map(c => c.pgWorkspaceId)).size === p.candidates.length;
// Writes accept only the new contract. Legacy data is normalized only on reads.
export const matchingPolicySchema = z.object({ ...policyFields, candidates: z.array(candidateSchema).max(50) })
  .strict().refine(uniqueCandidates, 'PG사는 한 번만 등록해요');
export const storedMatchingPolicySchema = z.object({
  ...policyFields,
  candidates: z.array(z.union([candidateSchema, legacyCandidateSchema.transform(c => ({
    pgWorkspaceId: c.pgWorkspaceId, reason: c.reason, feeNote: c.feeNote, feesByTier: emptyMatchingFees(),
  }))])).max(50),
}).strict().refine(uniqueCandidates, 'PG사는 한 번만 등록해요');
export type MatchingPolicy = z.infer<typeof matchingPolicySchema>;
export type StoredMatchingPolicy = z.input<typeof storedMatchingPolicySchema>;

export function parseMatchingFeesForm(form: FormData, pgWorkspaceId: string): z.infer<typeof matchingFeesSchema> {
  return Object.fromEntries(MERCHANT_TIERS.map(tier => {
    const value = String(form.get(`${pgWorkspaceId}:${tier}`) ?? '').trim();
    return [tier, value === '' ? null : Number(value)];
  })) as z.infer<typeof matchingFeesSchema>;
}
