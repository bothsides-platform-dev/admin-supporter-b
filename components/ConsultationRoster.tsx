'use client';
import { useId, useState } from 'react';
import type { Member, Option, RosterRule } from '@/lib/server/consultations/queries';

export function ConsultationRoster({
  initial,
  members,
  groups,
}: {
  initial: RosterRule[];
  members: Member[];
  groups: Option[];
}) {
  const prefix = useId();
  const [rows, setRows] = useState(initial.map((rule, i) => ({ ...rule, key: prefix + i })));
  function change(key: string, patch: Partial<RosterRule>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function moveUp(index: number) {
    setRows((current) => {
      const next = [...current];
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
      return next;
    });
  }
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">담당자 배정 순서</legend>
      <p className="text-body-small">위에서부터 업종과 거래 규모가 맞는 첫 담당자에게 배정합니다.</p>
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap items-center gap-2">
          <select
            aria-label={i + 1 + '순위 담당자'}
            name="userId"
            value={row.userId}
            required
            onChange={(e) => change(row.key, { userId: e.target.value })}
          >
            <option value="">담당자 선택</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
          <select
            aria-label={i + 1 + '순위 업종'}
            name="groupId"
            value={row.groupId ?? ''}
            onChange={(e) => change(row.key, { groupId: e.target.value || null })}
          >
            <option value="">전체 업종</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            aria-label={i + 1 + '순위 거래 규모'}
            name="size"
            value={row.size ?? ''}
            onChange={(e) => change(row.key, { size: (e.target.value as RosterRule['size']) || null })}
          >
            <option value="">전체 거래 규모</option>
            <option value="50m">5,000만 원 이상 1억 원 미만</option>
            <option value="100m">1억 원 이상</option>
          </select>
          <button type="button" disabled={i === 0} onClick={() => moveUp(i)}>
            위로
          </button>
          <button type="button" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRows([...rows, { key: crypto.randomUUID(), userId: '', groupId: null, size: null }])
        }
      >
        담당자 추가
      </button>
    </fieldset>
  );
}
