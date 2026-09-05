import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { workspaceNameChangeRequests } from '../workspace-name-change-requests';

describe('workspaceNameChangeRequests schema', () => {
  it('감사 이력 보존과 상태 불변식을 실제 Drizzle 스키마로 고정한다', () => {
    const config = getTableConfig(workspaceNameChangeRequests);

    expect(config.foreignKeys).toHaveLength(0);
    expect(config.checks.map((check) => check.name).sort()).toEqual([
      'workspace_name_change_requests_name_changed_chk',
      'workspace_name_change_requests_status_chk',
    ]);
    expect(config.indexes.map((index) => ({
      name: index.config.name,
      columns: index.config.columns.map((column) => 'name' in column ? column.name : null),
      unique: index.config.unique,
      partial: Boolean(index.config.where),
    }))).toEqual(expect.arrayContaining([
      {
        name: 'workspace_name_change_requests_one_pending_uniq',
        columns: ['workspace_id'],
        unique: true,
        partial: true,
      },
      {
        name: 'workspace_name_change_requests_status_submitted_idx',
        columns: ['status', 'submitted_at', 'id'],
        unique: false,
        partial: false,
      },
    ]));
  });
});
