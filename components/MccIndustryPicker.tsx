"use client";

import { INDUSTRY_CATEGORIES, industryDisplay, matchesIndustry } from '@/lib/industry-display';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MCC_INDUSTRIES, MCC_SOURCE, MCC_VERSION } from '@/lib/mcc-catalog';

export function MccIndustryPicker({ action, registered }: {
  action: (form: FormData) => Promise<void>;
  registered: { mccCode: string | null; name: string }[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const exists = (code: string, name: string) => registered.some(group => group.mccCode === code || group.name === name);
  const [category, setCategory] = useState<string | null>(null);
  const searching = query.trim().length > 0;
  const visible = MCC_INDUSTRIES.filter(item => searching ? matchesIndustry({name:item.name,mccCode:item.code},query) : industryDisplay({name:item.name,mccCode:item.code}).category === category);
  const selectedAvailable = selected.filter(code => {
    const item = MCC_INDUSTRIES.find(item => item.code === code)!;
    return !exists(item.code, item.name);
  });
  return <form action={action} className="space-y-4 rounded border border-outline-variant p-4">
    <p className="text-body-small text-on-surface-variant">표준 업종 {MCC_INDUSTRIES.length}개예요. 업종을 검색해 여러 개를 한 번에 등록해요. 등록된 업종은 추천 기준을 따로 설정할 수 있어요.</p>
    <label className="block space-y-1 text-body-small">
      <span>업종 검색</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="판매하는 상품이나 서비스로 검색해요" className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface" />
    </label>
    {query && <button type="button" onClick={() => setQuery('')} className="text-primary">검색 초기화</button>}
    {!searching && !category && <div className="grid gap-2 sm:grid-cols-2">{INDUSTRY_CATEGORIES.filter(value => MCC_INDUSTRIES.some(item => industryDisplay({name:item.name,mccCode:item.code}).category === value)).map(value => <button type="button" key={value} onClick={() => setCategory(value)} className="rounded border border-outline-variant px-3 py-2 text-left hover:bg-surface-container">{value}</button>)}</div>}
    {!searching && category && <div><button type="button" onClick={() => setCategory(null)} className="text-primary">전체 카테고리</button><p>{category}</p></div>}
    <div className="flex flex-wrap items-center gap-4 text-body-small">
      <button type="button" onClick={() => setSelected([...new Set([...selectedAvailable, ...visible.filter(item => !exists(item.code, item.name)).map(item => item.code)])])} className="text-primary hover:underline">현재 목록 모두 선택</button>
      <button type="button" onClick={() => setSelected([])} className="text-primary hover:underline">선택 해제</button>
      <span role="status">선택 <span className="md-numeric">{selectedAvailable.length}</span>개</span>
    </div>
    <fieldset className="space-y-2">
      <legend className="sr-only">등록할 표준 업종</legend>
      {visible.map(item => <label key={item.code} className="flex items-start gap-3 rounded border border-outline-variant px-3 py-2 text-body-small has-[:checked]:bg-surface-container">
        <input type="checkbox" disabled={exists(item.code, item.name)} value={item.code} checked={selectedAvailable.includes(item.code)} onChange={event => setSelected(event.target.checked ? [...selectedAvailable, item.code] : selectedAvailable.filter(code => code !== item.code))} className="mt-1" />
        <span className="flex-1">{industryDisplay({name:item.name,mccCode:item.code}).displayName}<span className="block text-on-surface-variant">{industryDisplay({name:item.name,mccCode:item.code}).examples}</span></span>
        {exists(item.code, item.name) && <span className="text-on-surface-variant">등록됨</span>}
      </label>)}
      {(searching || category) && visible.length === 0 && <p className="py-6 text-body-small text-on-surface-variant">검색 결과가 없어요. 다른 상품이나 서비스로 찾아봐요.</p>}
    </fieldset>
    {selectedAvailable.map(code => <input key={code} type="hidden" name="mccCodes" value={code} />)}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <details className="text-body-small text-on-surface-variant"><summary className="cursor-pointer">분류 정보</summary><p>{MCC_VERSION}</p>{MCC_INDUSTRIES.map(item => <p key={item.code}><span className="md-numeric">{item.code}</span> · {item.name}</p>)}<a href={MCC_SOURCE} target="_blank" rel="noreferrer" className="underline">Visa 2026년 4월 기준</a> · 전체 MCC 목록의 일부이며 실제 가맹점 코드 확정은 별도예요.</details>
      <ImportButton count={selectedAvailable.length} />
    </div>
  </form>;
}

function ImportButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={count === 0 || pending} className="rounded bg-primary px-4 py-2 text-label-small text-on-primary hover:bg-primary/90 disabled:opacity-50">{pending ? '등록 중…' : '선택한 업종 등록'}</button>;
}
