'use server';

import { revalidatePath } from 'next/cache';
import { type ActionState, toActionState } from '@/lib/action-state';
import { saveFollowup } from '@/lib/server/services/followups';

export async function saveFollowupAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const result = await saveFollowup(form);
  if (result.ok) {
    revalidatePath('/tasks');
    revalidatePath('/');
  }
  return toActionState(result, '업무를 저장했습니다.');
}
