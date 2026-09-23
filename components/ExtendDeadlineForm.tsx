import { ActionForm } from './ActionForm';
import { SubmitButton } from './SubmitButton';
import type { ActionState } from '@/lib/action-state';

/**
 * RFP 마감 연장 폼 섹션. 제출 결과(성공/실패)를 폼 아래에 인라인으로 표시한다.
 * `action`은 페이지에서 rfpId를 바인딩한 서버 액션 래퍼를 전달받는다.
 */
export function ExtendDeadlineForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <section className="rounded border border-outline-variant">
      <div className="border-b border-outline-variant px-4 py-2 bg-surface-container-low">
        <h2 className="text-title-small font-medium">마감 연장</h2>
      </div>
      <ActionForm action={action} className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <label htmlFor="extend-deadline-days" className="text-body-small text-on-surface-variant">
            연장 일수
          </label>
          <input
            id="extend-deadline-days"
            name="days"
            type="number"
            min={1}
            max={30}
            defaultValue={7}
            className="w-20 rounded border border-outline px-2 py-1 text-body-small bg-surface md-numeric focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-body-small text-on-surface-variant">일</span>
          <SubmitButton className="rounded bg-primary px-4 py-1.5 text-label-medium text-on-primary hover:bg-primary/90">
            연장
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
