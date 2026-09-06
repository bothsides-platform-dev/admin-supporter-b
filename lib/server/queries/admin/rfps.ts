import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import {
  rfps,
  workspaces,
  bids,
  bizProfiles,
  users,
  contracts,
  attachments,
} from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { MerchantTier } from '@/lib/types/biz-profile';
import type {
  PaymentFeesDisplay,
  CustomFeesDisplay,
  CustomPaymentMethod,
} from '@/lib/types/bid';
import { currentTermsOf, type CurrentTermsV1 } from '@/lib/types/rfp-terms';

export type RfpListRow = {
  id: string;
  code: string;
  title: string;
  status: 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';
  deadline: Date;
  buyerName: string;
  buyerWsId: string;
};

export type BidDetailRow = {
  id: string;
  pgWsId: string;
  pgWsName: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  round: number;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: PaymentFeesDisplay;
  customFees: CustomFeesDisplay;
  memo: string;
  submittedByName: string | null;
  submittedAt: Date;
};

export type AttachmentRow = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
};

export type ContractRow = {
  bidId: string;
  awardedAt: Date;
  awardedByName: string | null;
};

export async function listAllRfps(
  opts: { q?: string; status?: string } = {},
): Promise<RfpListRow[]> {
  const { q, status } = opts;
  return actionDb()
    .select({
      id: rfps.id,
      code: rfps.code,
      title: rfps.title,
      status: rfps.status,
      deadline: rfps.deadline,
      buyerName: workspaces.name,
      buyerWsId: rfps.buyerWsId,
    })
    .from(rfps)
    .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
    .where(
      and(
        q ? or(ilike(rfps.title, `%${q}%`), ilike(rfps.code, `%${q}%`)) : undefined,
        status && status !== 'all'
          ? eq(rfps.status, status as 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded')
          : undefined,
      ),
    )
    .orderBy(desc(rfps.createdAt)) as Promise<RfpListRow[]>;
}

export async function getRfpDetail(rfpId: string) {
  const [rfpRow] = await actionDb()
    .select({
      rfp: rfps,
      buyerName: workspaces.name,
      createdByName: users.name,
      createdByEmail: users.email,
      bizNo: bizProfiles.bizNo,
      taxType: bizProfiles.taxType,
      grade: bizProfiles.grade,
      gradeSource: bizProfiles.gradeSource,
    })
    .from(rfps)
    .innerJoin(workspaces, eq(rfps.buyerWsId, workspaces.id))
    .innerJoin(users, eq(rfps.createdBy, users.id))
    .leftJoin(bizProfiles, eq(rfps.bizProfileId, bizProfiles.id))
    .where(eq(rfps.id, rfpId));
  if (!rfpRow) return null;

  const { rfp, ...rfpMeta } = rfpRow;
  const currentTerms: CurrentTermsV1 = currentTermsOf(rfp.currentTerms);
  // jsonb 컬럼이라 drizzle 이 unknown 으로 돌려준다 — 표시 전 타입 좁히기.
  const customPaymentMethods = (rfp.customPaymentMethods ?? []) as CustomPaymentMethod[];

  const rawBids = await actionDb()
    .select({
      id: bids.id,
      pgWsId: bids.pgWsId,
      pgWsName: workspaces.name,
      status: bids.status,
      round: bids.round,
      settleCycle: bids.settleCycle,
      settleLimit: bids.settleLimit,
      guaranteeInsurance: bids.guaranteeInsurance,
      paymentFees: bids.paymentFees,
      customFees: bids.customFees,
      memo: bids.memo,
      submittedByName: users.name,
      submittedAt: bids.submittedAt,
    })
    .from(bids)
    .innerJoin(workspaces, eq(bids.pgWsId, workspaces.id))
    .leftJoin(users, eq(bids.submittedBy, users.id))
    .where(eq(bids.rfpId, rfpId))
    .orderBy(asc(workspaces.name), asc(bids.round));

  // numeric(precision,scale) 컬럼은 drizzle 이 문자열로 돌려준다 — 표시 전 변환.
  const normalizedBids: BidDetailRow[] = rawBids.map((b) => ({
    ...b,
    settleLimit: Number(b.settleLimit),
    guaranteeInsurance: Number(b.guaranteeInsurance),
    paymentFees: (b.paymentFees ?? {}) as PaymentFeesDisplay,
    customFees: (b.customFees ?? {}) as CustomFeesDisplay,
  }));

  const bidIds = normalizedBids.map((b) => b.id);

  const [contractRow] = await actionDb()
    .select({
      bidId: contracts.bidId,
      awardedAt: contracts.awardedAt,
      awardedByName: users.name,
    })
    .from(contracts)
    .leftJoin(users, eq(contracts.awardedBy, users.id))
    .where(eq(contracts.rfpId, rfpId));
  const contract: ContractRow | null = contractRow ?? null;

  const rfpAttachments: AttachmentRow[] = await actionDb()
    .select({
      id: attachments.id,
      name: attachments.name,
      size: attachments.size,
      mimeType: attachments.mimeType,
      uploadedAt: attachments.uploadedAt,
    })
    .from(attachments)
    .where(and(eq(attachments.rfpId, rfpId), eq(attachments.status, 'ready')));

  const proposalAttachments: AttachmentRow[] = bidIds.length
    ? await actionDb()
        .select({
          id: attachments.id,
          name: attachments.name,
          size: attachments.size,
          mimeType: attachments.mimeType,
          uploadedAt: attachments.uploadedAt,
        })
        .from(attachments)
        .where(and(inArray(attachments.bidId, bidIds), eq(attachments.status, 'ready')))
    : [];

  return {
    rfp,
    buyerName: rfpMeta.buyerName,
    createdByName: rfpMeta.createdByName,
    createdByEmail: rfpMeta.createdByEmail,
    bizProfile: rfp.bizProfileId
      ? {
          bizNo: rfpMeta.bizNo,
          taxType: rfpMeta.taxType,
          grade: rfpMeta.grade as MerchantTier | null,
          gradeSource: rfpMeta.gradeSource,
        }
      : null,
    currentTerms,
    customPaymentMethods,
    bids: normalizedBids,
    contract,
    attachments: rfpAttachments,
    proposalAttachments,
  };
}
