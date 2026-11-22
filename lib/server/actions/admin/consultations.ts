'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionFailure, actionSuccess, type ActionState } from '@/lib/action-state';
import { actionDb } from '../auth/_shared';
import {
  adjudicate,
  confirmCorrection,
  ConsultationConflict,
  policyInput,
  reassign,
  savePolicy,
} from '@/lib/server/consultations/manage';

const reasonInput = z.string().trim().min(1).max(2000);
async function perform(action: (actor: string) => Promise<string | void>, success: string) {
  const { adminId } = await requireAdminPermission('rfp.manage');
  try {
    const path = await action(adminId);
    revalidatePath('/consultations');
    if (path) revalidatePath(path);
    return actionSuccess(success);
  } catch (e) {
    if (e instanceof ConsultationConflict) return { status: 'error' as const, message: e.message };
    if (e instanceof z.ZodError) return actionFailure('INVALID_INPUT');
    throw e;
  }
}
export async function setAssignmentPolicy(pgId: string, _prev: ActionState, data: FormData) {
  return perform(async (actor) => {
    z.uuid().parse(pgId);
    const users = data.getAll('userId'),
      groups = data.getAll('groupId'),
      sizes = data.getAll('size');
    const input = policyInput.parse({
      enabled: data.has('enabled'),
      alimtalkReady: data.has('alimtalkReady'),
      managerId: data.get('managerId'),
      contactDays: Number(data.get('contactDays')),
      windowDays: Number(data.get('windowDays')),
      threshold: Number(data.get('threshold')),
      roster: users.map((userId, i) => ({
        userId,
        groupId: groups[i] || null,
        size: sizes[i] || null,
      })),
    });
    await savePolicy(actionDb(), actor, pgId, input);
    return '/consultations/' + pgId;
  }, '배정 기준을 저장했습니다.');
}
export async function setAssignee(reviewId: string, _prev: ActionState, data: FormData) {
  return perform(
    async (actor) =>
      '/rfps/' +
      (await reassign(
        actionDb(),
        actor,
        z.uuid().parse(reviewId),
        z.uuid().parse(data.get('assignee')),
        z.coerce.number().int().positive().parse(data.get('revision')),
        reasonInput.parse(data.get('reason')),
      )),
    '담당자를 배정했습니다.',
  );
}
export async function judgeContact(
  reviewId: string,
  questionId: string,
  _prev: ActionState,
  data: FormData,
) {
  return perform(
    async (actor) =>
      '/rfps/' +
      (await adjudicate(
        actionDb(),
        actor,
        z.uuid().parse(reviewId),
        z.uuid().parse(questionId),
        z.enum(['accepted', 'absent']).parse(data.get('judgment')),
        reasonInput.parse(data.get('reason')),
      )),
    '첫 연락 판정을 기록했습니다.',
  );
}
export async function sendCorrection(
  pgId: string,
  fingerprint: string,
) {
  return perform(async (actor) => {
    await confirmCorrection(
      actionDb(),
      actor,
      z.uuid().parse(pgId),
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(fingerprint),
    );
    return '/consultations/' + pgId;
  }, '확인한 시정 요청을 책임자에게 보낼 메일함에 등록했습니다.');
}
