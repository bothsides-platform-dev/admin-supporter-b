'use client';

import { useActionState, useState } from 'react';
import { IDLE_ACTION_STATE, type ActionState } from '@/lib/action-state';
import { ActionMessage } from './ActionForm';
import type { ImpactItem } from '@/lib/server/queries/admin/deletion-impact';

export function DangerousDeleteForm({
  name, label, impact, action,
}: {
  name: string;
  label: string;
  impact: ImpactItem[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, formAction, pending] = useActionState(action, IDLE_ACTION_STATE);
  const blocked = impact.some(item => item.kind === 'blocked');
  return (
    <section className="rounded border border-error p-4 space-y-3">
      <h2 className="text-title-small font-medium text-error">위험 구역</h2>
      <p className="text-body-small text-on-surface-variant">{label} <strong>{name}</strong>을(를) 영구 삭제합니다. 되돌릴 수 없습니다.</p>
      {impact.length > 0 && <div className="text-body-small"><p className="font-medium">연결 데이터</p><ul className="mt-1 list-disc pl-5">{impact.map(item => <li key={item.label}>{item.kind === 'blocked' ? '보존 대상 · ' : '삭제됨 · '}{item.label} {item.count}건</li>)}</ul></div>}
      {blocked && <p className="text-body-small text-error">보존 대상 업무 기록이 있어 현재 삭제할 수 없습니다. 계정 정지를 사용하거나 기록 보존 정책을 먼저 결정해 주세요.</p>}
      {!open ? <button type="button" disabled={blocked} onClick={() => setOpen(true)} className="rounded border border-error px-4 py-2 text-label-small text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40">{label} 영구 삭제</button> :
        <form action={formAction} className="space-y-3">
          <label className="block text-body-small">확인을 위해 <strong>{name}</strong> 입력
            <input name="confirmationName" value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" className="mt-1 block w-full rounded border border-error bg-surface px-3 py-2 text-on-surface" />
          </label>
          <div className="flex gap-2"><button type="submit" disabled={pending || typed !== name} className="rounded bg-error px-4 py-2 text-label-small text-on-error disabled:opacity-40">{pending ? '삭제 중…' : '영구 삭제'}</button><button type="button" disabled={pending} onClick={() => { setOpen(false); setTyped(''); }} className="rounded border border-outline-variant px-4 py-2 text-label-small">취소</button></div>
          <ActionMessage state={state} />
        </form>}
    </section>
  );
}
