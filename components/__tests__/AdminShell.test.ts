import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const pathRef = vi.hoisted(() => ({ value: '/name-change-requests' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathRef.value }));
vi.mock('@/app/login/actions', () => ({ logoutAction: vi.fn() }));

import { AdminShell } from '../AdminShell';

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function links(node: ReactNode): ElementProps[] {
  if (Array.isArray(node)) return node.flatMap(links);
  if (!isValidElement(node)) return [];
  const props = node.props as ElementProps;
  return [
    ...('href' in props ? [props] : []),
    ...links(props.children),
  ];
}

describe('AdminShell', () => {
  it('이름 변경 심사 링크를 노출하고 현재 경로로 표시한다', () => {
    pathRef.value = '/name-change-requests';
    const item = links(AdminShell({ children: null }))
      .find((props) => props.href === '/name-change-requests');

    expect(item).toBeDefined();
    expect(item?.['aria-current']).toBe('page');
  });

  it('하위 경로에서도 이름 변경 심사 메뉴를 활성 상태로 유지한다', () => {
    pathRef.value = '/name-change-requests/history';
    const item = links(AdminShell({ children: null }))
      .find((props) => props.href === '/name-change-requests');

    expect(item?.['aria-current']).toBe('page');
  });
});
