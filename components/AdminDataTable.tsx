import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AdminTableColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  /** 셀에 덧붙일 클래스(예: `whitespace-nowrap`). */
  cellClassName?: string;
  /** 액션 열처럼 머리글을 보이지 않게 두되 보조 기술에는 읽히게 한다. */
  hideLabel?: boolean;
  /** 머리글 셀 내용을 라벨 대신 직접 그린다(예: 전체 선택 체크박스). */
  header?: ReactNode;
};

export function AdminDataTable<Row>({ rows, columns, getKey, emptyMessage, emptyAction, caption, rowClassName, hoverRows = true }: {
  rows: Row[];
  columns: AdminTableColumn<Row>[];
  getKey: (row: Row) => string;
  emptyMessage: ReactNode;
  /** 빈 상태에서 바로 할 수 있는 다음 행동(예: 필터 초기화). */
  emptyAction?: { label: string; href: string };
  caption: string;
  rowClassName?: string;
  /** 행으로 이동할 수 없는 표(상세 화면의 멤버 표 등)는 hover 강조를 끈다. */
  hoverRows?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded border border-outline-variant">
      {/* break-keep: 좁은 화면에서 한글이 글자 단위로 꺾이지 않게 하고, 넘치면 바깥 래퍼가 가로 스크롤한다. */}
      <table className="w-full break-keep text-body-small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('whitespace-nowrap px-4 py-2 text-label-small text-on-surface-variant font-medium', column.align === 'right' ? 'text-right' : 'text-left')}>
                {column.header ?? (column.hideLabel ? <span className="sr-only">{column.label}</span> : column.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className={cn('border-b border-outline-variant last:border-0', hoverRows && 'hover:bg-surface-container-low', rowClassName)}>
              {columns.map((column) => (
                <td key={column.key} className={cn('px-4 py-3', column.align === 'right' && 'text-right', column.cellClassName)}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-on-surface-variant">
              {emptyMessage}
              {emptyAction && <Link href={emptyAction.href} className="ml-2 text-primary hover:underline">{emptyAction.label}</Link>}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
