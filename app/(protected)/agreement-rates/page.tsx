import { hasPermission } from '@/lib/auth/permissions';
import { eq } from 'drizzle-orm';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import { pgAgreementRates } from '@/lib/db/schema';
import { listSellers } from '@/lib/server/queries/admin/sellers';
import { AgreementRatesForm } from '@/components/AgreementRatesForm';

export default async function AgreementRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ pg?: string }>;
}) {
  const session = await requireAdminSession();
  const canEdit = hasPermission(session, 'agreement_rates.edit');
  const [params, sellers] = await Promise.all([searchParams, listSellers()]);
  const selected = sellers.find((pg) => pg.id === params.pg);
  const [policy] = selected
    ? await actionDb()
        .select()
        .from(pgAgreementRates)
        .where(eq(pgAgreementRates.pgWsId, selected.id))
    : [];
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-headline-small font-semibold">장기합의서 수수료 기준</h1>
        <p className="mt-2 text-body-medium text-on-surface-variant">
          PG사별 표준 수수료를 등록해요. 표준 요율과 선정 요율의 차이가 합의서의 할인 폭이 돼요.
        </p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label htmlFor="pg" className="space-y-2 text-body-small">
          <span className="block">PG사</span>
          <select
            id="pg"
            name="pg"
            required
            defaultValue={selected?.id ?? ''}
            className="min-w-60 rounded border border-outline-variant bg-surface px-3 py-2"
          >
            <option value="" disabled>
              PG사를 선택해주세요
            </option>
            {sellers.map((pg) => (
              <option key={pg.id} value={pg.id}>
                {pg.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded border border-outline-variant px-4 py-2 text-body-small">
          기준 조회하기
        </button>
      </form>
      {selected ? (
        <section className="space-y-4">
          <h2 className="text-title-medium">{selected.name}</h2>
          {!canEdit && <p className="text-body-small text-on-surface-variant">조회 전용입니다. 변경은 수수료 담당자에게 요청해 주세요.</p>}
          <fieldset disabled={!canEdit} className="disabled:opacity-75">
          <AgreementRatesForm
            key={`${selected.id}-${policy?.version ?? 0}`}
            pgWsId={selected.id}
            version={policy?.version ?? 0}
            rates={policy?.rates ?? []}
          />
          </fieldset>
        </section>
      ) : (
        <p className="rounded border border-outline-variant p-6 text-on-surface-variant">
          PG사를 선택하면 등록된 기준을 확인하거나 새로 등록할 수 있어요.
        </p>
      )}
    </div>
  );
}
