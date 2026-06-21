import { SubmitButton } from './SubmitButton';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const ALL_GRADES: MerchantGrade[] = ['small', 'sme1', 'sme2', 'sme3', 'general'];

/**
 * 워크스페이스(구매사·PG사)의 영중소구간(가맹점 등급)을 수정하는 폼 섹션.
 * `action`은 페이지에서 workspaceId를 바인딩한 서버 액션 래퍼를 전달받는다.
 */
export function GradeEditForm({
  action,
  currentGrade,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentGrade?: MerchantGrade | null;
}) {
  return (
    <section className="rounded border border-outline-variant p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title-small font-medium">영중소구간 (가맹점 등급)</h2>
        <span className="text-label-small text-on-surface-variant">
          현재: {currentGrade ? GRADE_LABELS[currentGrade] : '미설정'}
        </span>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="grade-edit-select" className="sr-only">
            영중소구간
          </label>
          <select
            id="grade-edit-select"
            name="grade"
            required
            defaultValue={currentGrade ?? ''}
            className="rounded border border-outline px-3 py-2 text-body-small bg-surface focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              등급 선택
            </option>
            {ALL_GRADES.map((g) => (
              <option key={g} value={g}>
                {GRADE_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton className="rounded bg-primary px-4 py-2 text-label-large text-on-primary hover:bg-primary/90">
          저장
        </SubmitButton>
      </form>
    </section>
  );
}
