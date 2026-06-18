'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/review', label: '입점 심사' },
  { href: '/admin/pg-members', label: 'PG 담당자 승인' },
  { href: '/users', label: '회원' },
  { href: '/buyers', label: '구매사' },
  { href: '/sellers', label: '판매사' },
  { href: '/rfps', label: 'RFP' },
  { href: '/audit-log', label: '감사 로그' },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-52 flex-shrink-0 border-r border-outline-variant bg-surface flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
          <div className="h-5 w-5 rounded bg-primary" />
          <span className="text-label-large font-semibold">Supporter B Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ href, label }) => {
            const isActive = href === '/'
              ? pathname === '/'
              : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center px-3 py-2 mx-2 text-body-medium rounded-[var(--md-sys-shape-small)]',
                  isActive
                    ? 'bg-secondary-container text-on-secondary-container font-medium'
                    : 'text-on-surface-variant hover:bg-surface-container-highest'
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <form action={logoutAction} className="p-3 border-t border-outline-variant flex items-center gap-2">
          <button type="submit" className="flex-1 text-left px-3 py-2 text-body-small text-on-surface-variant hover:bg-surface-container-highest rounded-[var(--md-sys-shape-small)]">
            로그아웃
          </button>
          <ThemeToggle />
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
