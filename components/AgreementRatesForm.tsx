'use client';
import { useActionState, useState } from 'react';
import {
  AGREEMENT_RATE_OPTIONS,
  agreementRateInputValue,
  parseAgreementRateForm,
  type AgreementRate,
} from '@/lib/agreement-rates';
import { saveAgreementRatesAction } from '@/lib/server/actions/admin/agreementRates';

const messages: Record<string, string> = {
  INVALID_INPUT: '수수료를 확인해주세요. 정률은 0~100%, 가상계좌는 건당 정수 금액으로 입력해요.',
  RATES_CHANGED: '다른 관리자가 기준을 변경했어요. 입력값을 확인한 뒤 최신 기준을 다시 열어주세요.',
  PG_WORKSPACE_REQUIRED: 'PG사를 다시 선택해주세요.',
};
export function AgreementRatesForm({
  pgWsId,
  version,
  rates,
}: {
  pgWsId: string;
  version: number;
  rates: AgreementRate[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rates.map((r) => [
        r.key,
        agreementRateInputValue(r.rate, r.key === 'virtual_account'),
      ]),
    ),
  );
  const [customRows, setCustomRows] = useState(() =>
    rates
      .filter((r) => r.key.startsWith('custom:'))
      .map((r) => ({ label: r.key.slice(7), rate: agreementRateInputValue(r.rate, false) })),
  );
  const [state, action, pending] = useActionState(
    async (previous: { version: number; message: string; error: boolean }, form: FormData) => {
      const parsed = parseAgreementRateForm(form, rates);
      if (!parsed.ok) return { ...previous, error: true, message: messages.INVALID_INPUT };
      try {
        const result = await saveAgreementRatesAction({
          pgWsId,
          version: previous.version,
          rates: parsed.rates,
        });
        return result.ok
          ? { version: result.version, message: '표준 수수료 기준을 저장했어요.', error: false }
          : {
              ...previous,
              error: true,
              message: messages[result.error] ?? '저장하지 못했어요. 다시 시도해주세요.',
            };
      } catch {
        return {
          ...previous,
          error: true,
          message: '연결을 확인하고 다시 시도해주세요. 입력한 값은 유지했어요.',
        };
      }
    },
    { version, message: '', error: false },
  );
  return (
    <form action={action} className="space-y-5">
      <p className="text-body-small text-on-surface-variant">
        빈칸은 미등록이에요. 할인 없이 적용할 기준도 직접 입력해주세요. 변경 내용은 다음 발송
        준비부터 적용되고 이미 보낸 합의서에는 반영되지 않아요.
      </p>
      <fieldset disabled={pending} className="space-y-4">
        <div className="overflow-x-auto rounded border border-outline-variant">
          <table className="w-full text-left text-body-small">
            <caption className="p-3 text-left text-on-surface-variant">
              부가세 별도 · 최종 수수료는 구매사가 선정한 견적을 사용해요.
            </caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="p-3">결제수단·등급</th>
                <th className="p-3">표준 수수료</th>
              </tr>
            </thead>
            <tbody>
              {AGREEMENT_RATE_OPTIONS.map((option) => (
                <tr key={option.key} className="border-b border-outline-variant">
                  <th className="p-3 font-normal">
                    <label htmlFor={`rate-${option.key}`}>{option.label}</label>
                  </th>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <input
                        id={`rate-${option.key}`}
                        name={`rate:${option.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={option.flat ? 1000000 : 100}
                        step={option.flat ? 1 : 'any'}
                        value={values[option.key] ?? ''}
                        placeholder="미등록"
                        onChange={(e) => setValues((v) => ({ ...v, [option.key]: e.target.value }))}
                        className="md-numeric w-28 rounded border border-outline-variant bg-surface px-3 py-2"
                      />
                      <span className="text-on-surface-variant">{option.flat ? '원/건' : '%'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 text-body-small">
          <p>직접입력 결제수단의 표준 수수료</p>
          <p className="text-on-surface-variant">
            결제수단 이름을 구매사가 입력한 그대로 넣어주세요. 앞뒤 공백과 줄바꿈도 구분해요.
          </p>
          {customRows.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block">결제수단 이름</span>
                <textarea
                  name="customLabel"
                  value={row.label}
                  onChange={(event) =>
                    setCustomRows((rows) =>
                      rows.map((current, at) =>
                        at === index ? { ...current, label: event.target.value } : current,
                      ),
                    )
                  }
                  maxLength={100}
                  rows={2}
                  className="block w-64 rounded border border-outline-variant bg-surface px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="block">표준 수수료 (%)</span>
                <input
                  name="customRate"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  value={row.rate}
                  onChange={(event) =>
                    setCustomRows((rows) =>
                      rows.map((current, at) =>
                        at === index ? { ...current, rate: event.target.value } : current,
                      ),
                    )
                  }
                  className="md-numeric block w-28 rounded border border-outline-variant bg-surface px-3 py-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setCustomRows((rows) => rows.filter((_, at) => at !== index))}
                className="rounded border border-outline-variant px-3 py-2"
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCustomRows((rows) => [...rows, { label: '', rate: '' }])}
            className="rounded border border-outline-variant px-3 py-2"
          >
            결제수단 추가
          </button>
        </div>
      </fieldset>
      {state.message && (
        <p
          role={state.error ? 'alert' : 'status'}
          className={state.error ? 'text-error' : 'text-on-surface'}
        >
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          disabled={pending}
          type="submit"
          className="rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-50"
        >
          {pending ? '저장 중…' : '기준 저장하기'}
        </button>
        <a
          href={`/agreement-rates?pg=${pgWsId}`}
          className="text-body-small text-primary underline"
        >
          최신 기준 다시 열기
        </a>
        <span className="text-body-small text-on-surface-variant">
          기준 판본 <span className="md-numeric">{state.version}</span>
        </span>
      </div>
    </form>
  );
}
