import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { hasPermission } from '@/lib/auth/permissions';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import {
  configOptions,
  saveConfig,
  listCases,
  correctCase,
  stopChannel,
  channelTag,
  type Config,
} from '@/lib/server/instant-quotes';
import {
  deadlineFields,
  priceOptions,
  prices,
  sales,
  saleOptions,
  type Policy,
} from '@/lib/instant-quote-policy';
import {
  AGREEMENT_RATE_OPTIONS,
  agreementRateInputValue,
} from '@/lib/agreement-rates';
import { MERCHANT_TIER_LABELS, type MerchantTier } from '@/lib/types/bid';
export const metadata = { title: 'PG 즉시 가입 견적' };
const path = '/instant-quotes';
const field = 'w-full rounded border border-outline-variant px-2 py-1';
function AmountField({
  name,
  label,
  value,
  optional,
}: {
  name: string;
  label: string;
  value?: Policy['terms']['insurance'];
  optional?: boolean;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <label>
        조건{' '}
        <select
          name={name}
          required={!optional}
          defaultValue={value?.kind ?? ''}
        >
          <option value="">
            {optional ? '비교 기준 없음' : '선택해주세요'}
          </option>
          <option value="fixed">금액 확정</option>
          <option value="none">해당 없음·면제</option>
          <option value="negotiable">협의 필요</option>
        </select>
      </label>{' '}
      <label>
        금액 (원){' '}
        <input
          name={name + '.won'}
          type="number"
          min="0"
          defaultValue={value?.kind === 'fixed' ? value.won : ''}
        />
      </label>
    </fieldset>
  );
}
function Cycle({
  name,
  value,
  optional,
}: {
  name: string;
  value?: Policy['terms']['cycle'];
  optional?: boolean;
}) {
  return (
    <fieldset>
      <legend>정산주기</legend>
      <label>
        D+ 일수{' '}
        <input
          type="number"
          required={!optional}
          min="0"
          max="365"
          name={name}
          defaultValue={value?.days}
        />
      </label>{' '}
      <label>
        단위{' '}
        <select name={name + '.unit'} defaultValue={value?.unit ?? 'business'}>
          <option value="business">영업일</option>
          <option value="calendar">달력일</option>
        </select>
      </label>
    </fieldset>
  );
}
function PolicyForm({ c }: { c: Config }) {
  const p = c.policy;
  async function save(f: FormData) {
    'use server';
    const s = await requireAdminPermission('recommendation.edit');
    const ok = await saveConfig(actionDb(), s.adminId, c.pg_id, c.group_id, f);
    redirect(
      path +
        '?config=' +
        c.group_id +
        '_' +
        c.pg_id +
        '&saved=' +
        (ok ? '1' : '0'),
    );
  }
  async function stop() {
    'use server';
    const s = await requireAdminPermission('recommendation.edit');
    await stopChannel(actionDb(), s.adminId, c.pg_id);
    redirect(path + '?saved=1');
  }
  return (
    <>
      <form action={save} className="space-y-5 rounded border p-4">
        <h2 className="font-semibold">
          {c.industry} · {c.pg} 약정 조건
        </h2>
        <input type="hidden" name="version" value={c.version ?? 0} />
        <input type="hidden" name="revision" value={c.revision ?? 0} />
        <input type="hidden" name="channelTag" value={channelTag(c)} />
        <label className="block">
          PG 지정 수신처
          <input
            name="recipient"
            type="email"
            required
            className={field}
            defaultValue={c.recipient ?? ''}
          />
        </label>
        <label className="block">
          PG 전용 가입 주소 (HTTPS)
          <input
            name="url"
            type="url"
            required
            className={field}
            defaultValue={c.signup_url ?? ''}
          />
        </label>
        <table className="w-full text-left">
          <caption>결제 수수료 (부가세 별도)</caption>
          <thead>
            <tr>
              <th>결제수단·등급</th>
              <th>PG 홈페이지 판가</th>
              <th>약정가</th>
            </tr>
          </thead>
          <tbody>
            {AGREEMENT_RATE_OPTIONS.filter(
              (o) => !o.label.includes('단일요율'),
            ).map((o) => {
              const standard = c.rates?.find((r) => r.key === o.key)?.rate,
                fee = p?.fees.find((r) => r.key === o.key)?.rate;
              const matching =
                !p && o.key.startsWith('card:')
                  ? c.candidate.feesByTier?.[o.key.slice(5)]
                  : undefined;
              return (
                <tr key={o.key}>
                  <th className="font-normal">{o.label}</th>
                  <td>
                    {standard === undefined
                      ? '미등록'
                      : agreementRateInputValue(standard, o.flat) +
                        (o.flat ? '원/건' : '%')}
                  </td>
                  <td>
                    <input
                      className="w-20 rounded border px-2 py-1 text-right"
                      aria-label={o.label + ' 약정가'}
                      inputMode="decimal"
                      name={'rate:' + o.key}
                      defaultValue={
                        fee !== undefined
                          ? agreementRateInputValue(fee, o.flat)
                          : (matching ?? '')
                      }
                    />{' '}
                    {o.flat ? '원/건' : '%'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Link href={'/agreement-rates?pg=' + c.pg_id}>PG 표준 요율 관리</Link>
        <h3>가입 조건</h3>
        <AmountField
          name="insurance"
          label="보증보험 가입금액"
          value={p?.terms.insurance}
        />
        <AmountField name="limit" label="정산한도" value={p?.terms.limit} />
        <AmountField
          name="signupFee"
          label="가입비"
          value={p?.terms.signupFee}
        />
        <Cycle name="cycle" value={p?.terms.cycle} />
        <h3>PG가 확인한 직접 가입 조건 (선택)</h3>
        <AmountField
          optional
          name="direct.insurance"
          label="보증보험 가입금액"
          value={p?.direct.insurance}
        />
        <AmountField
          optional
          name="direct.limit"
          label="정산한도"
          value={p?.direct.limit}
        />
        <Cycle optional name="direct.cycle" value={p?.direct.cycle} />
        <h3>추가 심사가 필요한 답변</h3>
        <label>
          <input
            type="checkbox"
            name="cash"
            defaultChecked={p?.review.cashConvertible}
          />{' '}
          환금성 상품 판매
        </label>
        <fieldset>
          <legend>최고 상품 가격대</legend>
          {priceOptions.map((v, i) => (
            <label key={v} className="mr-3 inline-block">
              <input
                type="checkbox"
                name="prices"
                value={v}
                defaultChecked={p?.review.prices.includes(v)}
              />
              {prices[i]}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>판매 방식</legend>
          {saleOptions.map((v, i) => (
            <label key={v} className="mr-3 inline-block">
              <input
                type="checkbox"
                name="sales"
                value={v}
                defaultChecked={p?.review.sales.includes(v)}
              />
              {sales[i]}
            </label>
          ))}
        </fieldset>
        <label>
          보장 가능한 최대 배송·서비스 기간 (일, 선택){' '}
          <input
            name="maxDeliveryDays"
            type="number"
            min="0"
            max="3650"
            defaultValue={p?.review.maxDeliveryDays ?? ''}
          />
        </label>
        <fieldset>
          <legend>PG와 합의한 기한 (달력일)</legend>
          {Object.entries(deadlineFields).map(([key, label]) => (
            <label key={key} className="block">
              {label}{' '}
              <input
                name={key}
                type="number"
                min="1"
                max={key === 'responseDays' ? 730 : 365}
                required
                defaultValue={p?.[key as keyof typeof deadlineFields]}
              />
            </label>
          ))}
        </fieldset>
        <label className="block">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={c.enabled ?? false}
          />{' '}
          이 PG의 신규 가입 신청 열기
        </label>
        <label className="block">
          <input type="checkbox" name="verified" /> PG와 수신처·가입 주소·적용
          조건 및 회신 절차를 확인했어요
        </label>
        <button>조건 저장</button>
      </form>
      {c.enabled && (
        <form action={stop}>
          <button>이 PG의 신규 접수 중단</button>
        </form>
      )}
    </>
  );
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    config?: string;
    stage?: string;
    saved?: string;
    code?: string;
  }>;
}) {
  const session = await requireAdminPermission('data.view'),
    sp = await searchParams,
    db = actionDb(),
    edit = hasPermission(session, 'recommendation.edit'),
    operate = hasPermission(session, 'rfp.manage');
  const [options, all] = await Promise.all([
    edit ? configOptions(db) : [],
    listCases(db, typeof sp.code === 'string' ? sp.code.trim() : undefined),
  ]);
  const c = options.find((v) => v.group_id + '_' + v.pg_id === sp.config);
  const cases = all.filter(
    (v) =>
      !sp.stage ||
      v.stage === sp.stage ||
      (sp.stage === '합의서 미시작' && v.agreement_not_started) ||
      (sp.stage === '합의서 미서명' && v.unsigned) ||
      (sp.stage === '접수 누락' && v.missing_application) ||
      (sp.stage === '수신 확인 지연' && v.unacknowledged) ||
      (sp.stage === '심사 결과 지연' && v.awaiting_result),
  );
  return (
    <main className="space-y-6">
      <AdminPageHeader title="PG 즉시 가입 견적" />
      {sp.saved && (
        <p role="status">
          {sp.saved === '1'
            ? '저장했어요.'
            : '저장하지 못했어요. 모든 등급의 판가와 약정가, 입력값, 최신 판본을 확인해주세요.'}
        </p>
      )}
      {edit && (
        <>
          <form className="space-x-2">
            <label>
              업종별 추천 PG{' '}
              <select name="config" defaultValue={sp.config ?? ''}>
                <option value="">업종과 PG 선택</option>
                {options.map((v) => (
                  <option
                    key={v.group_id + v.pg_id}
                    value={v.group_id + '_' + v.pg_id}
                  >
                    {v.industry} · {v.pg}
                  </option>
                ))}
              </select>
            </label>
            <button>조건 열기</button>
          </form>
          <Link href="/pg-recommendations">업종별 PG 순서 관리</Link>
          {c && <PolicyForm c={c} />}
        </>
      )}
      <h2 className="font-semibold">가입 신청 후속 처리</h2>
      <form className="flex flex-wrap gap-2">
        <label>
          견적번호{' '}
          <input
            name="code"
            className="rounded border px-2 py-1"
            defaultValue={sp.code}
          />
        </label>
        <button>신청 찾기</button>
      </form>
      <nav aria-label="가입 신청 상태" className="flex flex-wrap gap-3">
        {[
          '',
          '수신 확인 지연',
          '접수 누락',
          '심사 결과 지연',
          '합의서 미시작',
          '합의서 미서명',
          '조건 불일치',
          '정정 완료',
        ].map((v) => (
          <Link
            key={v}
            href={path + (v ? '?stage=' + encodeURIComponent(v) : '')}
          >
            {v || '전체'}
          </Link>
        ))}
      </nav>
      {!cases.length && <p>해당하는 신청이 없어요.</p>}
      {cases.map((a) => (
        <article key={a.id} className="space-y-2 rounded border p-4">
          <h3>
            {a.company} · {a.pg}
          </h3>
          <p>
            {a.code} · 약정 {a.terms.policyVersion}판 · 표준{' '}
            {a.terms.rateVersion}판
          </p>
          <p>
            {a.stage}
            {a.unacknowledged && ' · 수신 확인 지연'}
            {a.missing_application && ' · 접수 누락'}
            {a.awaiting_result && ' · 심사 결과 지연'}
          </p>
          <p>
            PG 메일{' '}
            {a.sent_at
              ? '발송 ' +
                new Date(a.sent_at).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })
              : a.mail_status === 'failed'
                ? '발송 실패'
                : '발송 대기'}{' '}
            ·{' '}
            {a.ack_at
              ? '수신자 확인 ' +
                new Date(a.ack_at).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })
              : '수신자 확인 전'}
          </p>
          {a.result_at && (
            <p>
              심사 회신 · {a.recipient} ·{' '}
              {new Date(a.result_at).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}{' '}
              · {a.decision === 'approved' ? '승인' : '거절'}
            </p>
          )}
          {a.reported && (
            <>
              <p>구매사 보고 · {a.reported}</p>
              <details>
                <summary>
                  약속한 조건 (
                  {MERCHANT_TIER_LABELS[a.tier as MerchantTier] ?? '등급 대기'})
                </summary>
                <ul>
                  {a.terms.policy.fees
                    .filter(
                      (r) =>
                        !r.key.includes(':') || r.key.endsWith(':' + a.tier),
                    )
                    .map((r) => (
                      <li key={r.key}>
                        {
                          AGREEMENT_RATE_OPTIONS.find((o) => o.key === r.key)
                            ?.label
                        }{' '}
                        {agreementRateInputValue(
                          r.rate,
                          r.key === 'virtual_account',
                        )}
                        {r.key === 'virtual_account' ? '원/건' : '%'}
                      </li>
                    ))}
                </ul>
                <p>
                  보증보험 · {amountText(a.terms.policy.terms.insurance)} /
                  정산한도 · {amountText(a.terms.policy.terms.limit)} / 정산 D+
                  {a.terms.policy.terms.cycle.days} (
                  {a.terms.policy.terms.cycle.unit === 'business'
                    ? '영업일'
                    : '달력일'}
                  ) / 가입비 · {amountText(a.terms.policy.terms.signupFee)}
                </p>
              </details>
              {a.correction_requested_at && (
                <p>PG에 정정 요청 메일을 예약했어요.</p>
              )}
              {a.resolution && <p>처리 결과 · {a.resolution}</p>}
              {operate && !a.resolution && (
                <form
                  action={async (f: FormData) => {
                    'use server';
                    const s = await requireAdminPermission('rfp.manage');
                    const ok = await correctCase(
                      actionDb(),
                      s,
                      a.id,
                      String(f.get('action')),
                      String(f.get('note') ?? ''),
                    );
                    redirect(path + '?saved=' + (ok ? '1' : '0'));
                  }}
                >
                  <label>
                    정정 요청 사유·처리 결과{' '}
                    <textarea
                      name="note"
                      required
                      maxLength={1500}
                      className={field}
                    />
                  </label>
                  {!a.correction_requested_at && (
                    <button name="action" value="request">
                      PG에 정정 요청
                    </button>
                  )}{' '}
                  <button name="action" value="resolve">
                    처리 결과 기록
                  </button>
                </form>
              )}
            </>
          )}
        </article>
      ))}
    </main>
  );
}
function amountText(v: Policy['terms']['insurance']) {
  return v.kind === 'fixed'
    ? v.won.toLocaleString('ko-KR') + '원'
    : v.kind === 'none'
      ? '해당 없음·면제'
      : '협의 필요';
}
