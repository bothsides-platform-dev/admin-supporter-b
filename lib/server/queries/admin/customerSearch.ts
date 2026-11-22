import { sql } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export const SEARCH_GROUPS = { buyers: '구매사', sellers: 'PG사', users: '회원', rfps: 'RFP' } as const;
export const SEARCH_LIMIT = 12;
export async function searchCustomers(value: unknown, db = actionDb()) {
  await requireAdminPermission('data.view');
  const term = typeof value === 'string' ? value.trim().slice(0, 160).toLowerCase() : '';
  if (!term) return [];
  const digits = /^[0-9 -]+$/.test(term) ? term.replace(/\D/g, '') : '';
  return db
    .select({
      type: sql<keyof typeof SEARCH_GROUPS>`hits.kind`,
      id: sql<string>`hits.id`,
      name: sql<string>`hits.name`,
      detail: sql<string>`hits.detail`,
      total: sql<number>`hits.total`.mapWith(Number),
    })
    .from(
      sql`(
    with records as (
      select case when w.type='buyer' then 'buyers' else 'sellers' end as kind, w.id, w.name,
        case when w.type='pg' then coalesce(p.biz_no,bp.biz_no,'') else coalesce(bp.biz_no,'') end as detail from workspaces w
        left join biz_profiles bp on bp.id=w.biz_profile_id left join pg_profiles p on p.workspace_id=w.id
        where w.type in ('buyer','pg')
      union all select 'users', u.id, u.name, u.email from users u where not u.is_system_account and u.deleted_at is null
      union all select 'rfps', r.id, r.code, r.title || ' · ' || w.name from rfps r join workspaces w on w.id=r.buyer_ws_id
    ), results as (
      select *, count(*) over(partition by kind) as total,
        row_number() over(partition by kind order by
          case when lower(name)=${term} or lower(detail)=${term} or id::text=${term} then 0 else 1 end, name,id) as pos
      from records where strpos(lower(name),${term})>0 or strpos(lower(detail),${term})>0 or id::text=${term}
        ${digits.length >= 4 ? sql`or (kind in ('buyers','sellers') and strpos(replace(detail,'-',''),${digits})>0)` : sql.empty()}
    )
    select * from results where pos <= ${SEARCH_LIMIT}
  ) hits`,
    )
    .orderBy(sql`hits.kind, hits.pos`);
}
