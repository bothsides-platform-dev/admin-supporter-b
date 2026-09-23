'use client';

import { useActionState } from 'react';
import { IDLE_ACTION_STATE, type ActionState } from '@/lib/action-state';

/** 액션 결과 메시지. idle 상태면 아무것도 렌더링하지 않는다. */
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;
  const isError = state.status === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={`text-body-small ${isError ? 'text-error' : 'text-primary'}`}
    >
      {state.message}
    </p>
  );
}

/**
 * 서버 액션 결과(ActionState)를 폼 안에 인라인으로 보여주는 폼.
 * `action`은 페이지에서 대상 id를 바인딩한 서버 액션 래퍼를 전달받는다.
 * 제출 버튼은 children 안에 `SubmitButton`으로 넣으면 pending 표시가 붙는다.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE_ACTION_STATE);
  return (
    <form action={formAction} className={className}>
      {children}
      <ActionMessage state={state} />
    </form>
  );
}
