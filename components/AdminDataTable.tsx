import type { ReactNode } from 'react';

export type AdminTableColumn<Row> = {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
};

export function AdminDataTable<Row>({ rows, columns, getKey, emptyMessage, caption }: {
  rows: Row[];
  columns: AdminTableColumn<Row>[];
  getKey: (row: Row) => string;
  emptyMessage: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto rounded border border-outline-variant">
      <table className="w-full text-body-small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-4 py-2 text-label-small text-on-surface-variant font-medium ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getKey(row)} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-on-surface-variant">{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
