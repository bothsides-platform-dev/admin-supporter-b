import { redirect } from 'next/navigation';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { savePgRecommendationGroupAction, deletePgRecommendationGroupAction } from '@/lib/server/actions/admin/pgRecommendationGroups';
import { listPgRecommendationGroups, type PgRecommendationGroupRow } from '@/lib/server/queries/admin/pgRecommendations';
import { listSellers } from '@/lib/server/queries/admin/sellers';

const ERRORS: Record<string, string> = {
  INVALID_INPUT: '업종 이름과 표시 순서를 확인해주세요.',
  PG_WORKSPACE_REQUIRED: 'PG사 목록이 바뀌었어요. 새로고침 후 다시 선택해주세요.',
  GROUP_NOT_FOUND: '해당 업종을 찾을 수 없어요. 새로고침해주세요.',
  DUPLICATE_GROUP_NAME: '같은 이름의 업종이 이미 있어요.',
};

export default async function PgRecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdminSession();
  const [{ error, saved }, groups, sellers] = await Promise.all([
    searchParams,
    listPgRecommendationGroups(),
    listSellers(),
  ]);
  const groupNameByPg = new Map(groups.flatMap((group) =>
    group.pgWorkspaceIds.map((id) => [id, group.name] as const)));

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
          업종마다 추천할 PG사를 지정해요. PG사 한 곳은 한 업종에만 속해요.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-error px-4 py-3 text-body-small text-error">
          {ERRORS[error] ?? '저장하지 못했어요. 다시 시도해주세요.'}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded border border-outline-variant px-4 py-3 text-body-small text-on-surface">
          추천 기준을 저장했어요.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-title-small font-semibold">새 업종</h2>
        <GroupForm action={save} sellers={sellers} groupNameByPg={groupNameByPg} />
      </section>

      <section className="space-y-3">
        <h2 className="text-title-small font-semibold">등록된 업종 ({groups.length}개)</h2>
        {groups.length === 0 ? (
          <p className="rounded border border-outline-variant px-4 py-8 text-center text-body-small text-on-surface-variant">
            등록된 업종이 없어요. 업종을 만들고 PG사를 지정해주세요.
          </p>
        ) : groups.map((group) => {
          async function remove() {
            'use server';
            const result = await deletePgRecommendationGroupAction(actionDb(), group.id);
            if (!result.ok) redirect(`/pg-recommendations?error=${encodeURIComponent(result.error)}`);
            redirect('/pg-recommendations?saved=1');
          }
          return (
            <div key={group.id} className="rounded border border-outline-variant p-4 space-y-3">
              <GroupForm action={save} group={group} sellers={sellers} groupNameByPg={groupNameByPg} />
              <div className="border-t border-outline-variant pt-3">
                <ConfirmButton
                  action={remove}
                  label="업종 삭제"
                  confirmMessage="이 업종을 삭제하면 PG사의 업종 지정도 풀려요. 삭제할까요?"
                  confirmLabel="삭제"
                  labelClassName="text-label-small text-error hover:underline"
                  confirmClassName="rounded bg-error px-3 py-1.5 text-label-small text-on-error hover:bg-error/90"
                />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

type SellerOption = Awaited<ReturnType<typeof listSellers>>[number];

function GroupForm({
  action,
  group,
  sellers,
  groupNameByPg,
}: {
  action: (formData: FormData) => Promise<void>;
  group?: PgRecommendationGroupRow;
  sellers: SellerOption[];
  groupNameByPg: Map<string, string>;
}) {
  const selected = new Set(group?.pgWorkspaceIds ?? []);
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
      <fieldset className="space-y-2">
        <legend className="text-label-small text-on-surface-variant">추천할 PG사</legend>
        <p className="text-label-small text-on-surface-variant">
          다른 업종의 PG사를 선택하면 이 업종으로 이동해요. 승인 대기 PG사는 지정할 수 있지만 구매사 추천에는 표시되지 않아요.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.map((seller) => (
            <label key={seller.id} className="flex items-start gap-2 rounded border border-outline-variant px-3 py-2 text-body-small cursor-pointer hover:bg-surface-container-low">
              <input type="checkbox" name="pgWorkspaceIds" value={seller.id} defaultChecked={selected.has(seller.id)} className="mt-1" />
              <span className="min-w-0">
                <span className="block break-words">{seller.name}</span>
                <span className="block text-label-small text-on-surface-variant">
                  {seller.status === 'active' ? '승인됨' : seller.status === 'pending' ? '승인 대기' : '정지됨'}
                  {groupNameByPg.get(seller.id) && groupNameByPg.get(seller.id) !== group?.name
                    ? ` · 현재 ${groupNameByPg.get(seller.id)}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
