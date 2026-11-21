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

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (!isValidElement(node)) return '';
  return text((node.props as ElementProps).children);
}

describe('AdminShell', () => {
  it('대기 건이 있는 심사 메뉴에만 건수를 붙인다', () => {
    pathRef.value = '/';
    const items = links(AdminShell({ children: null, counts: { review: 3, nameChange: 0, pgMembers: 120 } }));
    const label = (href: string) => text(items.find((props) => props.href === href)?.children);

    expect(label('/review')).toBe('입점 심사3');
    expect(label('/name-change-requests')).toBe('이름 변경 심사');
    expect(label('/admin/pg-members')).toBe('PG 담당자 승인99+');
    expect(label('/buyers')).toBe('구매사');
  });

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
