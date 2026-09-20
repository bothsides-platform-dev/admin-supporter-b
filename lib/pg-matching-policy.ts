// Validation contract shared with supporter-b lib/rfp/pg-matching.ts.
import { z } from 'zod';

const candidateSchema = z.object({
  pgWorkspaceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
  feeMin: z.number().min(0).max(100).nullable(),
  feeMax: z.number().min(0).max(100).nullable(),
  feeNote: z.string().trim().max(300),
}).strict().refine(c => (c.feeMin === null && c.feeMax === null) ||
  (c.feeMin !== null && c.feeMax !== null && c.feeMin <= c.feeMax && c.feeNote.length > 0),
  '요율 범위와 적용 조건을 확인해주세요');

export const matchingPolicySchema = z.object({
  risk: z.enum(['unconfigured', 'white', 'gray', 'black']),
  candidates: z.array(candidateSchema).max(50),
}).strict().refine(p => new Set(p.candidates.map(c => c.pgWorkspaceId)).size === p.candidates.length, 'PG사는 한 번만 등록해요');
export type MatchingPolicy = z.infer<typeof matchingPolicySchema>;
