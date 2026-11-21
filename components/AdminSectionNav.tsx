import { cn } from '@/lib/utils';

export type AdminSectionLink = { id: string; label: string };

/**
 * 긴 상세 화면의 섹션 목차(같은 페이지 앵커). `orientation="vertical"` 은 넓은
 * 화면의 보조 열에, `horizontal` 은 머리 아래 한 줄에 쓴다.
 * 대상 섹션에는 같은 `id` 와 `scroll-mt-4` 를 붙인다.
 */
export function AdminSectionNav({ items, orientation = 'horizontal', className }: {
  items: AdminSectionLink[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="이 페이지의 섹션" className={className}>
      <ul className={cn('text-label-small', orientation === 'vertical' ? 'space-y-1 border-l border-outline-variant' : 'flex flex-wrap gap-x-3 gap-y-1')}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn('text-on-surface-variant hover:text-on-surface hover:underline', orientation === 'vertical' && '-ml-px block border-l border-transparent py-1 pl-3 hover:border-outline')}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
