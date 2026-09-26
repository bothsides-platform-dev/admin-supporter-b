"use client";
import { useState, type ReactNode } from 'react';
import { INDUSTRY_CATEGORIES, industryDisplay, matchesIndustry } from '@/lib/industry-display';
type Entry = { id: string; name: string; mccCode: string | null; content: ReactNode };
export function RegisteredIndustryBrowser({ entries }: { entries: Entry[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const searching = query.trim().length > 0;
  const visible = (entry: Entry) => searching ? matchesIndustry(entry, query) : industryDisplay(entry).category === category;
  return <div className="space-y-3">
    <label className="block space-y-1 text-body-small"><span>등록된 업종 검색</span><input type="search" placeholder="판매하는 상품이나 서비스로 검색해요" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded border border-outline-variant bg-surface px-3 py-2" /></label>
    {query && <button type="button" onClick={() => setQuery('')} className="text-primary">검색 초기화</button>}
    {!searching && !category && <div className="grid gap-2 sm:grid-cols-2">{INDUSTRY_CATEGORIES.filter(value => entries.some(entry => industryDisplay(entry).category === value)).map(value => <button type="button" key={value} onClick={() => setCategory(value)} className="rounded border border-outline-variant px-3 py-2 text-left hover:bg-surface-container">{value}</button>)}</div>}
    {!searching && category && <div><button type="button" onClick={() => setCategory(null)} className="text-primary">전체 카테고리</button><p>{category}</p></div>}
    {searching && !entries.some(visible) && <p role="status">검색 결과가 없어요. 다른 상품이나 서비스로 찾아봐요.</p>}
    {entries.map(entry => {
      const display = industryDisplay(entry);
      // Keep server-rendered forms mounted so uncontrolled edits survive filtering.
      return <div key={entry.id} hidden={!visible(entry)} className="space-y-2">
        <h3 className="text-title-small">{display.displayName}</h3>
        {display.examples && <p className="text-body-small text-on-surface-variant">{display.examples}</p>}
        {entry.content}
      </div>;
    })}
  </div>;
}
