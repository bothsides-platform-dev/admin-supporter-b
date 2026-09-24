"use client";

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MCC_INDUSTRIES, MCC_SOURCE, searchMccIndustries } from '@/lib/mcc-catalog';

export function MccIndustryPicker({ action, registered }: {
  action: (form: FormData) => Promise<void>;
  registered: { mccCode: string | null; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const exists = (code: string, name: string) => registered.some(group => group.mccCode === code || group.name === name);
  const visible = searchMccIndustries(query);
  const selectedAvailable = selected.filter(code => {
    const item = MCC_INDUSTRIES.find(item => item.code === code)!;
    return !exists(item.code, item.name);
  });
  return <form action={action} className="space-y-4 rounded border border-outline-variant p-4">
    <p className="text-body-small text-on-surface-variant">MCC 기반 상담용 업종 {MCC_INDUSTRIES.length}개예요. 업종을 검색해 여러 개를 한 번에 등록해요. 등록된 업종은 추천 기준을 따로 설정할 수 있어요.</p>
    <label className="block space-y-1 text-body-small">
      <span>업종 이름 또는 MCC 코드 검색</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="예: 의류, 교육, 5651" className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface" />
    </label>
    <div className="flex flex-wrap items-center gap-4 text-body-small">
      <button type="button" onClick={() => setSelected([...new Set([...selectedAvailable, ...visible.filter(item => !exists(item.code, item.name)).map(item => item.code)])])} className="text-primary hover:underline">검색 결과 모두 선택</button>
      <button type="button" onClick={() => setSelected([])} className="text-primary hover:underline">선택 해제</button>
      <span role="status">선택 <span className="md-numeric">{selectedAvailable.length}</span>개</span>
    </div>
    <fieldset className="max-h-80 space-y-1 overflow-y-auto">
      <legend className="sr-only">등록할 표준 업종</legend>
      {visible.map(item => <label key={item.code} className="flex items-start gap-3 rounded border border-outline-variant px-3 py-2 text-body-small has-[:checked]:bg-surface-container">
        <input type="checkbox" disabled={exists(item.code, item.name)} value={item.code} checked={selectedAvailable.includes(item.code)} onChange={event => setSelected(event.target.checked ? [...selectedAvailable, item.code] : selectedAvailable.filter(code => code !== item.code))} className="mt-1" />
        <span className="flex-1">{item.name}<span className="ml-2 text-on-surface-variant">{item.category}</span></span>
        <span className="md-numeric text-on-surface-variant">{item.code}</span>
        {exists(item.code, item.name) && <span className="text-on-surface-variant">등록됨</span>}
      </label>)}
      {visible.length === 0 && <p className="py-6 text-body-small text-on-surface-variant">검색 결과가 없어요. 다른 이름이나 코드로 찾아봐요.</p>}
    </fieldset>
    {selectedAvailable.map(code => <input key={code} type="hidden" name="mccCodes" value={code} />)}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-body-small text-on-surface-variant"><a href={MCC_SOURCE} target="_blank" rel="noreferrer" className="underline">Visa 2026년 4월 기준</a> · 전체 MCC 목록의 일부이며 실제 가맹점 코드 확정은 별도예요.</p>
      <ImportButton count={selectedAvailable.length} />
    </div>
  </form>;
}

function ImportButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={count === 0 || pending} className="rounded bg-primary px-4 py-2 text-label-small text-on-primary hover:bg-primary/90 disabled:opacity-50">{pending ? '등록 중…' : '선택한 업종 등록'}</button>;
}
