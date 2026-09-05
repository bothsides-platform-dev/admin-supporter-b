import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmitButton } from '@/components/SubmitButton';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/server/queries/admin/workspaceNameChanges', () => ({
  listWorkspaceNameChangeRequests: mocks.list,
}));
vi.mock('@/lib/server/actions/admin/reviewWorkspaceNameChangeAction', () => ({
  approveWorkspaceNameChangeAction: mocks.approve,
  rejectWorkspaceNameChangeAction: mocks.reject,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import WorkspaceNameChangeRequestsPage from '../page';

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function walk(node: ReactNode, visit: (props: ElementProps, type: unknown) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isValidElement(node)) return;
  const props = node.props as ElementProps;
  visit(props, node.type);
  walk(props.children, visit);
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isValidElement(node)) return '';
  return textOf((node.props as ElementProps).children);
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    workspaceId: '10000000-0000-4000-8000-000000000001',
    workspaceType: 'buyer',
    requesterName: '김담당',
    requesterEmail: 'owner@example.com',
    currentName: '기존 이름',
    requestedName: '새 이름',
    status: 'pending',
    reason: null,
    reviewedBy: null,
    submittedAt: new Date('2026-09-05T00:00:00Z'),
    reviewedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.list.mockReset();
  mocks.approve.mockReset().mockResolvedValue({ ok: true });
  mocks.reject.mockReset().mockResolvedValue({ ok: true });
  mocks.redirect.mockReset();
});

describe('WorkspaceNameChangeRequestsPage', () => {
  it('기본 pending 필터와 빈 상태를 표시한다', async () => {
    mocks.list.mockResolvedValue([]);
    const tree = await WorkspaceNameChangeRequestsPage({ searchParams: Promise.resolve({}) });

    expect(mocks.list).toHaveBeenCalledWith({ status: 'pending' });
    expect(textOf(tree)).toContain('이름 변경 요청이 없습니다.');
  });

  it('대기 구매사 요청의 승인·거절 폼을 실제 액션 인자로 연결한다', async () => {
    mocks.list.mockResolvedValue([request()]);
    const tree = await WorkspaceNameChangeRequestsPage({ searchParams: Promise.resolve({ status: 'pending' }) });
    const actionForms: Array<(data: FormData) => Promise<void>> = [];
    const hrefs: unknown[] = [];
    const submitButtons: ElementProps[] = [];
    let reasonInput: ElementProps | undefined;
    let reasonLabel: ElementProps | undefined;
    walk(tree, (props, type) => {
      if (type === 'form' && typeof props.action === 'function') {
        actionForms.push(props.action as (data: FormData) => Promise<void>);
      }
      if ('href' in props) hrefs.push(props.href);
      if (type === SubmitButton) submitButtons.push(props);
      if (type === 'input' && props.name === 'reason') reasonInput = props;
      if (type === 'label' && textOf(props.children) === '거절 사유') reasonLabel = props;
    });

    expect(textOf(tree)).toContain('구매사 · 확인 중');
    expect(hrefs).toContain('/buyers/10000000-0000-4000-8000-000000000001');
    expect(actionForms).toHaveLength(2);
    expect(submitButtons).toHaveLength(2);
    expect(reasonInput?.id).toBe('name-change-reject-reason-20000000-0000-4000-8000-000000000001');
    expect(reasonLabel?.htmlFor).toBe(reasonInput?.id);

    const rejectData = new FormData();
    rejectData.set('requestId', '20000000-0000-4000-8000-000000000001');
    rejectData.set('reason', '증빙이 필요합니다.');
    await actionForms[0](rejectData);
    const approveData = new FormData();
    approveData.set('requestId', '20000000-0000-4000-8000-000000000001');
    await actionForms[1](approveData);

    expect(mocks.reject).toHaveBeenCalledWith(undefined, '20000000-0000-4000-8000-000000000001', '증빙이 필요합니다.');
    expect(mocks.approve).toHaveBeenCalledWith(undefined, '20000000-0000-4000-8000-000000000001');
  });

  it('중복·정지 오류를 주소 상태로 돌려 복구 안내를 표시한다', async () => {
    mocks.list.mockResolvedValue([request()]);
    mocks.approve.mockResolvedValue({ ok: false, error: 'REQUEST_NOT_PENDING' });
    const tree = await WorkspaceNameChangeRequestsPage({
      searchParams: Promise.resolve({ status: 'pending', error: 'WORKSPACE_NOT_ACTIVE' }),
    });
    const actionForms: Array<(data: FormData) => Promise<void>> = [];
    walk(tree, (props, type) => {
      if (type === 'form' && typeof props.action === 'function') {
        actionForms.push(props.action as (data: FormData) => Promise<void>);
      }
    });

    expect(textOf(tree)).toContain('워크스페이스 상태나 현재 이름이 달라 승인할 수 없어요.');
    const approveData = new FormData();
    approveData.set('requestId', '20000000-0000-4000-8000-000000000001');
    await actionForms[1](approveData);
    expect(mocks.redirect).toHaveBeenCalledWith(
      '/name-change-requests?status=pending&error=REQUEST_NOT_PENDING',
    );
  });

  it('처리된 PG 요청은 사유를 표시하고 처리 폼을 숨긴다', async () => {
    mocks.list.mockResolvedValue([request({
      workspaceType: 'pg',
      status: 'rejected',
      reason: '사업자 확인이 필요합니다.',
    })]);
    const tree = await WorkspaceNameChangeRequestsPage({ searchParams: Promise.resolve({ status: 'rejected' }) });
    let actionFormCount = 0;
    const hrefs: unknown[] = [];
    walk(tree, (props, type) => {
      if (type === 'form' && typeof props.action === 'function') actionFormCount += 1;
      if ('href' in props) hrefs.push(props.href);
    });

    expect(textOf(tree)).toContain('PG사 · 거절');
    expect(textOf(tree)).toContain('사업자 확인이 필요합니다.');
    expect(hrefs).toContain('/sellers/10000000-0000-4000-8000-000000000001');
    expect(actionFormCount).toBe(0);
  });

  it('삭제된 워크스페이스 요청은 이력을 표시하되 회사 링크를 만들지 않는다', async () => {
    mocks.list.mockResolvedValue([request({ workspaceType: null })]);
    const tree = await WorkspaceNameChangeRequestsPage({ searchParams: Promise.resolve({ status: '' }) });
    const hrefs: unknown[] = [];
    walk(tree, (props) => {
      if ('href' in props) hrefs.push(props.href);
    });

    expect(mocks.list).toHaveBeenCalledWith({ status: '' });
    expect(textOf(tree)).toContain('삭제된 워크스페이스 · 확인 중');
    expect(hrefs.some((href) => String(href).startsWith('/buyers/') || String(href).startsWith('/sellers/'))).toBe(false);
  });
});
