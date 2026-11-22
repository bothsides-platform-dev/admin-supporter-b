import { notFound } from 'next/navigation';
import { AdminPageHeader } from '@/components/AdminPageHeader';
import { AdminListPagination } from '@/components/AdminListPagination';
import { tasksHref } from '@/lib/followups';
import { followupTimeline } from '@/lib/server/queries/admin/followups';
import { formatKST } from '@/lib/utils';

export const metadata = { title: '연락·처리 기록' };
export default async function TaskHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const result = await followupTimeline(id, (await searchParams).page);
  if (!result) notFound();
  const { task, rows } = result;
  const back = tasksHref({
    rfp: task.rfpId ?? undefined,
    workspace: task.rfpId ? undefined : (task.workspaceId ?? undefined),
    view: task.done ? 'done' : 'open',
  });
  return (
    <div className="max-w-3xl space-y-4">
      <AdminPageHeader
        title={task.title}
        breadcrumbs={[{ label: '후속 업무', href: back }]}
        meta={
          <>
            {task.company ?? '미연결 문의'} · {task.owner ?? '미배정'} · {task.done ? '완료' : '다음 연락'}{' '}
            {formatKST(task.done ?? task.due)}
          </>
        }
      />
      <h2 className="font-medium">연락·처리 기록</h2>
      {rows.length ? (
        <ol className="divide-y divide-outline-variant rounded border border-outline-variant">
          {rows.map((u) => (
            <li key={u.id} className="p-3 text-body-small">
              <p className="text-on-surface-variant">
                {formatKST(u.createdAt)} · {u.actor}
              </p>
              <p className="whitespace-pre-wrap">{u.note}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>아직 남긴 기록이 없습니다.</p>
      )}
      <AdminListPagination path={`/tasks/${id}`} page={result.page} total={result.total} />
    </div>
  );
}
