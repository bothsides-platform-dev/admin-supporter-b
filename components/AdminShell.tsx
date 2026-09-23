'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/login/actions';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

import { ADMIN_NAVIGATION } from '@/lib/admin-navigation';
import { hasPermission, ROLE_LABELS, type AdminRole } from '@/lib/auth/permissions';

export function AdminShell({ children, role = 'operator', adminId }: { children: React.ReactNode; role?: AdminRole; adminId?: string }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background md:h-screen md:flex-row md:overflow-hidden">
      <aside className="w-full flex-shrink-0 border-b border-outline-variant bg-surface flex flex-col md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
          <div className="h-5 w-5 rounded bg-primary" />
          <span className="text-label-large font-semibold">서포트비 어드민</span>
        </div>
        <nav aria-label="관리 메뉴" className="max-h-48 flex-1 overflow-y-auto py-2 md:max-h-none">
          {ADMIN_NAVIGATION.map(group => <div key={group.label} className="mb-3">
            <p className="px-5 py-1 text-label-small text-on-surface-variant">{group.label}</p>
          {group.items.filter(item => hasPermission({ role }, item.permission)).map(({ href, label }) => {
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
          </div>)}
        </nav>
        <div className="px-5 py-2 text-body-small text-on-surface-variant">
          <span>{ROLE_LABELS[role]}</span>
          {adminId && <p className="truncate" title={adminId}>{adminId}</p>}
        </div>
        <form action={logoutAction} className="p-3 border-t border-outline-variant flex items-center gap-2">
          <button type="submit" className="flex-1 text-left px-3 py-2 text-body-small text-on-surface-variant hover:bg-surface-container-highest rounded-[var(--md-sys-shape-small)]">
            로그아웃
          </button>
          <ThemeToggle />
        </form>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:overflow-y-auto md:p-6">
        {children}
      </main>
    </div>
  );
}
