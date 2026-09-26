import { RegisteredIndustryBrowser } from '@/components/RegisteredIndustryBrowser';
import { MccIndustryPicker } from '@/components/MccIndustryPicker';
import { hasPermission } from '@/lib/auth/permissions';
import { pgMatchingDefaults, pgMatchingPolicies } from '@/lib/db/schema';
import type { MatchingPolicy } from '@/lib/pg-matching-policy';
import { savePgMatchingPolicyAction, savePgMatchingDefaultsAction } from '@/lib/server/actions/admin/pgMatchingPolicy';
import { redirect } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { savePgRecommendationGroupAction, deletePgRecommendationGroupAction, importMccIndustriesAction } from '@/lib/server/actions/admin/pgRecommendationGroups';
import { listPgRecommendationGroups, type PgRecommendationGroupRow } from '@/lib/server/queries/admin/pgRecommendations';
import { listSellers } from '@/lib/server/queries/admin/sellers';

const ERRORS: Record<string, string> = {
  INVALID_INPUT: '업종·추천 사유·요율 범위와 적용 조건을 확인해주세요.',
  PG_WORKSPACE_REQUIRED: 'PG사 목록이 바뀌었어요. 새로고침 후 다시 선택해주세요.',
  GROUP_NOT_FOUND: '해당 업종을 찾을 수 없어요. 새로고침해주세요.',
  DUPLICATE_GROUP_NAME: '같은 이름의 업종이 이미 있어요.',
};

export default async function PgRecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; added?: string; skipped?: string }>;
}) {
  const session = await requireAdminSession();
  const canEdit = hasPermission(session, 'recommendation.edit');
  const [{ error, saved, added, skipped }, groups, sellers] = await Promise.all([
    searchParams,
    listPgRecommendationGroups(),
    listSellers(),
  ]);
  const policies: { groupId: string; policy: MatchingPolicy }[] = await actionDb().select().from(pgMatchingPolicies);

  const [defaults] = await actionDb().select({ policy: pgMatchingDefaults.policy }).from(pgMatchingDefaults);

  async function importIndustries(form: FormData) {
    'use server';
    const result = await importMccIndustriesAction(actionDb(), form.getAll('mccCodes'));
    if (!result.ok) redirect(`/pg-recommendations?error=${encodeURIComponent(result.error)}`);
    redirect(`/pg-recommendations?saved=1&added=${result.added}&skipped=${result.skipped}`);
  }

  async function save(formData: FormData) {
    'use server';
    const id = formData.get('id');
    const result = await savePgRecommendationGroupAction(actionDb(), {
      id: typeof id === 'string' && id ? id : undefined,
      name: String(formData.get('name') ?? ''),
      sortOrder: Number(formData.get('sortOrder')),
      pgWorkspaceIds: formData.getAll('pgWorkspaceIds').filter((value): value is string => typeof value === 'string'),
    });
    if (!result.ok) redirect(`/pg-recommendations?error=${encodeURIComponent(result.error)}`);
    redirect('/pg-recommendations?saved=1');
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-headline-small font-semibold">PG 추천 기준</h1>
        <p className="mt-1 text-body-small text-on-surface-variant">
          업종의 접수 기준과 PG 추천 순서를 정해요. 같은 PG사를 여러 업종에 연결할 수 있어요. 확인된 입점 조건과 요율만 등록해주세요.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-error px-4 py-3 text-body-small text-error">
          {ERRORS[error] ?? '저장하지 못했어요. 다시 시도해주세요.'}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded border border-outline-variant px-4 py-3 text-body-small text-on-surface">
          {added !== undefined ? `업종 ${Number(added) || 0}개를 등록했어요. ${Number(skipped) || 0}개는 이미 등록되어 건너뛰었어요.` : '추천 기준을 저장했어요.'}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-title-small font-semibold">기본 추천 PG</h2>
        <p className="text-body-small text-on-surface-variant">업종별 추천이 미설정이거나 상담 가능한 후보가 없으면 아래 PG사를 추천해요. 접수 불가 업종은 제외하고, 이전에 상담한 PG사는 다시 추천하지 않아요. 구매사가 한 곳을 골라 상담을 요청해요.</p>
        {!defaults && <p role="status" className="text-body-small text-error">기본 추천 PG를 먼저 설정해주세요. 미설정 상태에서는 업종별 후보가 없는 상담을 접수할 수 없어요.</p>}
        <fieldset disabled={!canEdit} className="rounded border border-outline-variant p-4 disabled:opacity-75">
          <PolicyForm sellers={sellers} policy={defaults?.policy} />
        </fieldset>
      </section>
      {canEdit && <section className="space-y-3">
        <h2 className="text-title-small font-semibold">표준 업종에서 선택</h2>
        <MccIndustryPicker action={importIndustries} registered={groups} />
      </section>}
      {canEdit && <section className="space-y-3">
        <h2 className="text-title-small font-semibold">직접 업종 등록</h2>
        <GroupForm action={save} />
      </section>}
      {!canEdit && <p className="text-body-small text-on-surface-variant">조회 전용입니다. 변경은 수수료 담당자에게 요청해 주세요.</p>}

      <section className="space-y-3">
        <h2 className="text-title-small font-semibold">등록된 업종 ({groups.length}개)</h2>
        {groups.length === 0 ? (
          <p className="rounded border border-outline-variant px-4 py-8 text-center text-body-small text-on-surface-variant">
            등록된 업종이 없어요. 업종을 만들고 PG사를 지정해주세요.
          </p>
        ) : <RegisteredIndustryBrowser entries={groups.map((group) => {
          async function remove() {
            'use server';
            const result = await deletePgRecommendationGroupAction(actionDb(), group.id);
            if (!result.ok) redirect(`/pg-recommendations?error=${encodeURIComponent(result.error)}`);
            redirect('/pg-recommendations?saved=1');
          }
          return { id: group.id, name: group.name, mccCode: group.mccCode, content: (
            <fieldset disabled={!canEdit} key={group.id} className="rounded border border-outline-variant p-4 space-y-3 disabled:opacity-75">
              {group.mccCode && <details className="text-body-small text-on-surface-variant"><summary className="cursor-pointer">분류 정보</summary><p>상담용 MCC <span className="md-numeric">{group.mccCode}</span> · {group.mccVersion}</p></details>}
              <GroupForm action={save} group={group} />
              <PolicyForm groupId={group.id} sellers={sellers} policy={policies.find(p => p.groupId === group.id)?.policy} />
              <div className="border-t border-outline-variant pt-3">
                <ConfirmButton
                  action={remove}
                  label="업종 삭제"
                  confirmMessage="이 업종을 삭제하면 신규 추천과 다음 추천이 중단돼요. 진행 중인 상담 이력은 남아요. 삭제할까요?"
                  confirmLabel="삭제"
                  labelClassName="text-label-small text-error hover:underline"
                  confirmClassName="rounded bg-error px-3 py-1.5 text-label-small text-on-error hover:bg-error/90"
                />
              </div>
            </fieldset>
          ) };
        })} />}
      </section>
    </div>
  );
}

type SellerOption = Awaited<ReturnType<typeof listSellers>>[number];

function GroupForm({
  action,
  group,
}: {
  action: (formData: FormData) => Promise<void>;
  group?: PgRecommendationGroupRow;
}) {
  const prefix = group?.id ?? 'new';
  return (
    <form action={action} className="rounded border border-outline-variant p-4 space-y-4">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
        <label className="space-y-1 text-label-small text-on-surface-variant" htmlFor={`${prefix}-name`}>
          <span className="block">업종 이름</span>
          <input id={`${prefix}-name`} name="name" required maxLength={60} defaultValue={group?.name ?? ''}
            className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface" />
        </label>
        <label className="space-y-1 text-label-small text-on-surface-variant" htmlFor={`${prefix}-order`}>
          <span className="block">표시 순서</span>
          <input id={`${prefix}-order`} name="sortOrder" type="number" min={0} max={1000} required defaultValue={group?.sortOrder ?? 0}
            className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface md-numeric" />
        </label>
        <button type="submit" className="rounded bg-primary px-4 py-2 text-label-small text-on-primary hover:bg-primary/90">
          {group ? '변경 저장' : '업종 만들기'}
        </button>
      </div>
      {group?.pgWorkspaceIds.map(id => <input key={id} type="hidden" name="pgWorkspaceIds" value={id} />)}
    </form>
  );
}


function PolicyForm({ groupId, sellers, policy = { risk: 'unconfigured', candidates: [] } }: { groupId?: string; sellers: SellerOption[]; policy?: MatchingPolicy }) {
  async function savePolicy(form: FormData) {
    'use server';
    const selected = form.getAll('candidate').map(String);
    const candidates = selected.map(id => ({
      pgWorkspaceId: id,
      reason: String(form.get(`${id}:reason`) ?? ''),
      feeMin: form.get(`${id}:min`) ? Number(form.get(`${id}:min`)) : null,
      feeMax: form.get(`${id}:max`) ? Number(form.get(`${id}:max`)) : null,
      feeNote: String(form.get(`${id}:note`) ?? ''),
    })).sort((a, b) => Number(form.get(`${a.pgWorkspaceId}:order`)) - Number(form.get(`${b.pgWorkspaceId}:order`)));
    const result = groupId
      ? await savePgMatchingPolicyAction(actionDb(), { groupId, policy: { risk: String(form.get('risk')) as MatchingPolicy['risk'], candidates } })
      : await savePgMatchingDefaultsAction(actionDb(), { risk: 'gray', candidates });
    if (!result.ok) redirect(`/pg-recommendations?error=${encodeURIComponent(result.error)}`);
    redirect('/pg-recommendations?saved=1');
  }
  const inputClass = 'w-full rounded border border-outline-variant bg-surface px-3 py-2 text-body-small text-on-surface';
  const ordered = [...sellers].sort((a, b) => {
    const rank = (id: string) => { const i = policy.candidates.findIndex(c => c.pgWorkspaceId === id); return i < 0 ? 10000 : i; };
    return rank(a.id) - rank(b.id);
  });
  return <form action={savePolicy} className="space-y-4 border-t border-outline-variant pt-4">
    {groupId ? <label className="block space-y-1 text-body-small">접수 기준
      <select name="risk" defaultValue={policy.risk} className={inputClass}>
        <option value="unconfigured">미설정 — 기본 추천 PG 사용</option>
        <option value="white">White · 일반 업종</option>
        <option value="gray">Gray · 추가 검토</option>
        <option value="black">Black · 접수 불가</option>
      </select>
    </label> : <p className="text-body-small">기본 추천은 추가 검토 대상으로 안내해요. 활성 PG사를 한 곳 이상 선택해주세요.</p>}
    <p className="text-body-small text-on-surface-variant">숫자가 작은 PG사를 먼저 추천해요. 업종별 후보가 없으면 기본 후보를 사용하고, 접수 불가 업종은 추천하지 않아요. 활성 PG사만 구매사에게 보여요.</p>
    <div className="space-y-2">
      {ordered.map((seller, index) => {
        const candidate = policy.candidates.find(c => c.pgWorkspaceId === seller.id);
        return <details key={seller.id} open={!!candidate} className="rounded border border-outline-variant p-3">
          <summary className="cursor-pointer text-body-small">{seller.name} · {candidate ? '추천에 포함' : '미포함'}{seller.status !== 'active' ? ' · 비활성' : ''}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-body-small"><input type="checkbox" name="candidate" value={seller.id} disabled={!groupId && seller.status !== 'active'} defaultChecked={!!candidate} />추천에 포함하기</label>
            <label className="text-body-small">우선순위<input className={`${inputClass} md-numeric`} type="number" min={1} max={1000} name={`${seller.id}:order`} defaultValue={index + 1} /></label>
            <label className="text-body-small sm:col-span-2">추천 사유<input className={inputClass} maxLength={300} name={`${seller.id}:reason`} defaultValue={candidate?.reason ?? ''} /></label>
            <label className="text-body-small">영세 예상 수수료 최저 (%)<input className={`${inputClass} md-numeric`} type="number" step="0.01" min={0} max={100} name={`${seller.id}:min`} defaultValue={candidate?.feeMin ?? ''} /></label>
            <label className="text-body-small">영세 예상 수수료 최고 (%)<input className={`${inputClass} md-numeric`} type="number" step="0.01" min={0} max={100} name={`${seller.id}:max`} defaultValue={candidate?.feeMax ?? ''} /></label>
            <label className="text-body-small sm:col-span-2">요율 적용 조건 (요율 입력 시 필수)<input className={inputClass} maxLength={300} placeholder="부가세·결제수단·심사 조건 등" name={`${seller.id}:note`} defaultValue={candidate?.feeNote ?? ''} /></label>
          </div>
        </details>;
      })}
    </div>
    <p className="text-body-small text-on-surface-variant">요율을 비우면 구매사에게 견적에서 안내한다고 표시해요. 신규 사업자의 영세 적용과 환급은 반기별 선정 결과에 따라 달라져요.</p>
    <button type="submit" className="rounded bg-primary px-4 py-2 text-label-small text-on-primary hover:bg-primary/90">{groupId ? '접수·추천 기준 저장' : '기본 추천 PG 저장'}</button>
  </form>;
}
