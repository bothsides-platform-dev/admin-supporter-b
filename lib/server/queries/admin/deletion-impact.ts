import { count, eq, inArray, or } from 'drizzle-orm';
import {
  attachments, bidNotes, bids, bidQuoteTemplates, chatConversations, chatMessageTemplates, chatMessages,
  columns, contracts, notifications, pgAgreementRates, pgProfiles, pgRecommendationMembers,
  rfpAllowedPg, rfpInvitations, rfpPgRequests, rfpRequoteRequests, rfpTeamMessages,
  rfps, verificationApplications, workspaceInvitations, workspaceMembers,
} from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type ImpactItem = { label: string; count: number; kind: 'deleted' | 'blocked' };

export async function getWorkspaceDeletionImpact(id: string): Promise<ImpactItem[]> {
  const db = actionDb();
  const rfpIds = db.select({ id: rfps.id }).from(rfps).where(eq(rfps.buyerWsId, id));
  const bidCondition = or(eq(bids.pgWsId, id), inArray(bids.rfpId, rfpIds))!;
  const bidIds = db.select({ id: bids.id }).from(bids).where(bidCondition);
  const noteIds = db.select({ id: bidNotes.id }).from(bidNotes).where(inArray(bidNotes.bidId, bidIds));
  const conversationIds = db.select({ id: chatConversations.id }).from(chatConversations).where(or(eq(chatConversations.buyerWsId, id), eq(chatConversations.pgWsId, id)));
  const messageIds = db.select({ id: chatMessages.id }).from(chatMessages).where(inArray(chatMessages.conversationId, conversationIds));
  const teamMessageIds = db.select({ id: rfpTeamMessages.id }).from(rfpTeamMessages).where(or(eq(rfpTeamMessages.workspaceId, id), inArray(rfpTeamMessages.rfpId, rfpIds)));
  const queries = [
    ['멤버십', db.select({ total: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, id))],
    ['심사 신청', db.select({ total: count() }).from(verificationApplications).where(eq(verificationApplications.workspaceId, id))],
    ['RFP', db.select({ total: count() }).from(rfps).where(eq(rfps.buyerWsId, id))],
    ['입찰', db.select({ total: count() }).from(bids).where(bidCondition)],
    ['계약', db.select({ total: count() }).from(contracts).where(or(inArray(contracts.rfpId, rfpIds), inArray(contracts.bidId, bidIds)))],
    ['RFP 초대', db.select({ total: count() }).from(rfpInvitations).where(or(eq(rfpInvitations.pgWsId, id), inArray(rfpInvitations.rfpId, rfpIds)))],
    ['RFP 허용 PG', db.select({ total: count() }).from(rfpAllowedPg).where(or(eq(rfpAllowedPg.pgWsId, id), inArray(rfpAllowedPg.rfpId, rfpIds)))],
    ['RFP 참여 요청', db.select({ total: count() }).from(rfpPgRequests).where(or(eq(rfpPgRequests.pgWsId, id), inArray(rfpPgRequests.rfpId, rfpIds)))],
    ['워크스페이스 초대', db.select({ total: count() }).from(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, id))],
    ['재견적 요청', db.select({ total: count() }).from(rfpRequoteRequests).where(or(eq(rfpRequoteRequests.pgWsId, id), inArray(rfpRequoteRequests.rfpId, rfpIds)))],
    ['입찰 메모', db.select({ total: count() }).from(bidNotes).where(inArray(bidNotes.bidId, bidIds))],
    ['첨부파일', db.select({ total: count() }).from(attachments).where(or(inArray(attachments.rfpId, rfpIds), inArray(attachments.bidId, bidIds), inArray(attachments.bidNoteId, noteIds), inArray(attachments.chatMessageId, messageIds), inArray(attachments.rfpTeamMessageId, teamMessageIds)))],
    ['채팅 대화', db.select({ total: count() }).from(chatConversations).where(or(eq(chatConversations.buyerWsId, id), eq(chatConversations.pgWsId, id)))],
    ['채팅 메시지', db.select({ total: count() }).from(chatMessages).where(inArray(chatMessages.conversationId, conversationIds))],
    ['RFP 팀 메시지', db.select({ total: count() }).from(rfpTeamMessages).where(or(eq(rfpTeamMessages.workspaceId, id), inArray(rfpTeamMessages.rfpId, rfpIds)))],
    ['알림', db.select({ total: count() }).from(notifications).where(eq(notifications.workspaceId, id))],
    ['작업 칸', db.select({ total: count() }).from(columns).where(eq(columns.workspaceId, id))],
    ['PG 프로필', db.select({ total: count() }).from(pgProfiles).where(eq(pgProfiles.workspaceId, id))],
    ['PG 추천 멤버십', db.select({ total: count() }).from(pgRecommendationMembers).where(eq(pgRecommendationMembers.pgWsId, id))],
    ['수수료 기준', db.select({ total: count() }).from(pgAgreementRates).where(eq(pgAgreementRates.pgWsId, id))],
  ] as const;
  const counts = await Promise.all(queries.map(async ([label, query]) => ({ label, count: Number((await query)[0]?.total ?? 0) })));
  return counts.filter((item) => item.count > 0).map((item) => ({ ...item, kind: 'deleted' as const }));
}

export async function getUserDeletionImpact(id: string): Promise<ImpactItem[]> {
  const db = actionDb();
  const queries = [
    ['소속 멤버십', db.select({ total: count() }).from(workspaceMembers).where(eq(workspaceMembers.userId, id))],
    ['생성한 RFP', db.select({ total: count() }).from(rfps).where(eq(rfps.createdBy, id))],
    ['제출한 입찰', db.select({ total: count() }).from(bids).where(eq(bids.submittedBy, id))],
    ['체결한 계약', db.select({ total: count() }).from(contracts).where(eq(contracts.awardedBy, id))],
    ['업로드한 첨부파일', db.select({ total: count() }).from(attachments).where(eq(attachments.uploadedBy, id))],
    ['발송한 초대', db.select({ total: count() }).from(workspaceInvitations).where(eq(workspaceInvitations.invitedByUserId, id))],
    ['저장한 견적 템플릿', db.select({ total: count() }).from(bidQuoteTemplates).where(eq(bidQuoteTemplates.createdBy, id))],
    ['작성한 채팅 템플릿', db.select({ total: count() }).from(chatMessageTemplates).where(eq(chatMessageTemplates.createdBy, id))],
    ['생성한 재견적 요청', db.select({ total: count() }).from(rfpRequoteRequests).where(eq(rfpRequoteRequests.createdByUserId, id))],
    ['작성한 채팅', db.select({ total: count() }).from(chatMessages).where(eq(chatMessages.authorUserId, id))],
    ['작성한 입찰 메모', db.select({ total: count() }).from(bidNotes).where(eq(bidNotes.authorId, id))],
    ['작성한 RFP 팀 메시지', db.select({ total: count() }).from(rfpTeamMessages).where(eq(rfpTeamMessages.authorUserId, id))],
    ['생성한 RFP 참여 요청', db.select({ total: count() }).from(rfpPgRequests).where(eq(rfpPgRequests.createdByUserId, id))],
  ] as const;
  const counts = await Promise.all(queries.map(async ([label, query]) => ({ label, count: Number((await query)[0]?.total ?? 0) })));
  const protectedLabels = new Set(['생성한 RFP', '제출한 입찰', '체결한 계약', '업로드한 첨부파일', '생성한 재견적 요청', '작성한 채팅', '작성한 채팅 템플릿', '작성한 입찰 메모', '작성한 RFP 팀 메시지', '생성한 RFP 참여 요청']);
  return counts.filter((item) => item.count > 0).map((item) => ({ ...item, kind: protectedLabels.has(item.label) ? 'blocked' as const : 'deleted' as const }));
}
