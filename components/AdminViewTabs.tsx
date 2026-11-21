import Link from 'next/link';
import { cn } from '@/lib/utils';

export type AdminViewTab = { label: string; href: string; active: boolean };

/**
 * 목록의 고정 보기(상태별 프리셋). 저장 기능이 없는 링크 묶음이라 주소만 바뀐다.
 * 탭 UI 가 아니라 내비게이션이므로 role=tablist 대신 nav + aria-current 를 쓴다.
 */
export function AdminViewTabs({ label, tabs }: { label: string; tabs: AdminViewTab[] }) {
  return (
    <nav aria-label={label} className="overflow-x-auto border-b border-outline-variant">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                '-mb-px block border-b-2 px-3 py-2 text-label-large',
                tab.active
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-on-surface-variant hover:border-outline hover:text-on-surface',
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
