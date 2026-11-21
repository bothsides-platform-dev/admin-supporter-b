import Link from 'next/link';
import type { ReactNode } from 'react';

export type AdminBreadcrumb = { label: string; href?: string };

/**
 * 보호 영역 공통 페이지 머리. 상세 화면은 `breadcrumbs` 로 목록까지의 경로를,
 * `badges` 로 상태를, children 으로 페이지 단위 액션을 넘긴다.
 * 마지막 경로 항목(현재 화면)은 제목과 같으므로 breadcrumbs 에는 상위 경로만 넣는다.
 */
export function AdminPageHeader({ title, description, breadcrumbs, badges, meta, children }: {
  title: string;
  /** 제목 아래 한두 줄 안내. */
  description?: ReactNode;
  breadcrumbs?: AdminBreadcrumb[];
  badges?: ReactNode;
  /** 제목 아래 식별 정보 한 줄(ID·코드 등). */
  meta?: ReactNode;
  /** 페이지 단위 액션(버튼·외부 링크). */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-1">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="현재 위치">
          <ol className="flex flex-wrap items-center gap-1 text-body-small text-on-surface-variant">
            {breadcrumbs.map((crumb) => (
              <li key={`${crumb.label}-${crumb.href ?? ''}`} className="flex items-center gap-1">
                {crumb.href
                  ? <Link href={crumb.href} className="hover:text-on-surface hover:underline">{crumb.label}</Link>
                  : <span>{crumb.label}</span>}
                <span aria-hidden="true">›</span>
              </li>
            ))}
            <li aria-current="page" className="max-w-full truncate text-on-surface">{title}</li>
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-headline-small font-semibold">{title}</h1>
          {badges}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {meta && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label-small text-on-surface-variant">{meta}</div>}
      {description && <p className="max-w-3xl text-body-small text-on-surface-variant">{description}</p>}
    </header>
  );
}
