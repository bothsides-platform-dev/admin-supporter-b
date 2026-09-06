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

// jsonb 컬럼은 DB 레벨에서 모양을 강제하지 않는다 — 과거 데이터 오류나 수기
// SQL 로 잘못된 모양(배열이어야 할 자리에 객체 등)이 들어가면 .map()/Object.keys()
// 가 그대로 던져 페이지 전체가 500 난다(코드 리뷰에서 지적됨). 표시 직전에 한 번
// 모양을 확인해 아니면 빈 값으로 fail-safe 처리한다.
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// 배열 모양은 맞아도 원소가 잘못될 수 있다(null, id/label 이 string 이 아닌 항목
// 등) — page.tsx/BidFeeMatrix 가 c.id/c.label 을 그대로 dereference 하므로
// 원소 단위로도 검증해야 한다(코드 리뷰에서 지적됨).
function asCustomPaymentMethods(value: unknown): CustomPaymentMethod[] {
  return asArray<unknown>(value).filter(
    (c): c is CustomPaymentMethod =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Record<string, unknown>).id === 'string' &&
      typeof (c as Record<string, unknown>).label === 'string',
  );
}

// PGlite 테스트 주입용 — lib/server/queries/admin/workspaceNameChanges.ts 와 동일 패턴.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

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

// db: DB(any) 로 select 체인 반환형이 전부 any 로 새는 것을 막기 위한 명시적 캐스팅
// 타입 — page.tsx 쪽 rfp.contractType/customPaymentMethods 등이 any 로 번지지
// 않도록 쿼리 결과를 여기서 한 번 좁힌다.
type RfpDetailQueryRow = {
  rfp: typeof rfps.$inferSelect;
  buyerName: string;
  createdByName: string;
  createdByEmail: string;
  bizNo: string | null;
  taxType: 'general' | 'simple' | 'exempt' | null;
  grade: MerchantTier | null;
  gradeSource: string;
};

type RawBidRow = {
  id: string;
  pgWsId: string;
  pgWsName: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  round: number;
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  paymentFees: unknown;
  customFees: unknown;
  memo: string;
  submittedByName: string | null;
  submittedAt: Date;
};

export async function listAllRfps(
  opts: { q?: string; status?: string } = {},
  db: DB = actionDb(),
): Promise<RfpListRow[]> {
  const { q, status } = opts;
  return db
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

export async function getRfpDetail(rfpId: string, db: DB = actionDb()) {
  const [rfpRow] = await db
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
    .where(eq(rfps.id, rfpId)) as RfpDetailQueryRow[];
  if (!rfpRow) return null;

  const { rfp, ...rfpMeta } = rfpRow;
  const currentTerms: CurrentTermsV1 = currentTermsOf(rfp.currentTerms);
  // jsonb 컬럼이라 drizzle 이 unknown 으로 돌려준다 — 표시 전 타입 좁히기.
  const customPaymentMethods = asCustomPaymentMethods(rfp.customPaymentMethods);

  // 아래 3개 쿼리는 서로 독립적(모두 rfpId 만으로 조회)이라 병렬로 실행한다 —
  // proposalAttachments 만 rawBids 의 bidIds 에 의존하므로 별도로 이어서 조회.
  const [rawBids, contractRow, rfpAttachments] = (await Promise.all([
    db
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
      .orderBy(asc(workspaces.name), asc(bids.round)),
    db
      .select({
        bidId: contracts.bidId,
        awardedAt: contracts.awardedAt,
        awardedByName: users.name,
      })
      .from(contracts)
      .leftJoin(users, eq(contracts.awardedBy, users.id))
      .where(eq(contracts.rfpId, rfpId)),
    db
      .select({
        id: attachments.id,
        name: attachments.name,
        size: attachments.size,
        mimeType: attachments.mimeType,
        uploadedAt: attachments.uploadedAt,
      })
      .from(attachments)
      .where(and(eq(attachments.rfpId, rfpId), eq(attachments.status, 'ready'))),
  ])) as [RawBidRow[], ContractRow[], AttachmentRow[]];

  // numeric(precision,scale) 컬럼은 drizzle 이 문자열로 돌려준다 — 표시 전 변환.
  const normalizedBids: BidDetailRow[] = rawBids.map((b: RawBidRow) => ({
    ...b,
    settleLimit: Number(b.settleLimit),
    guaranteeInsurance: Number(b.guaranteeInsurance),
    paymentFees: asRecord(b.paymentFees) as PaymentFeesDisplay,
    customFees: asRecord(b.customFees) as CustomFeesDisplay,
  }));

  const bidIds = normalizedBids.map((b) => b.id);
  const contract: ContractRow | null = contractRow[0] ?? null;

  const proposalAttachments: AttachmentRow[] = bidIds.length
    ? await db
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
