import { isValidElement, type ComponentProps, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notes: vi.fn(), history: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/server/queries/admin/adminNotes', () => ({ getAdminNotes: mocks.notes }));
vi.mock('@/lib/server/queries/admin/reviewHistory', () => ({ getApplicationReviewHistory: mocks.history }));
vi.mock('@/lib/server/actions/admin/createAdminNoteAction', () => ({ createAdminNoteAction: mocks.create }));
vi.mock('@/lib/server/actions/admin/deleteAdminNoteAction', () => ({ deleteAdminNoteAction: vi.fn() }));

import { WorkspaceReviewInfo } from '../WorkspaceReviewInfo';
import { ActionForm } from '../ActionForm';

type Props = ComponentProps<typeof WorkspaceReviewInfo>;
const props: Props = {
  workspace: { id: 'buyer-1', type: 'buyer', status: 'active' },
  application: { id: 'application-1', status: 'approved', submittedAt: new Date('2026-10-20T00:00:00Z') },
  bizProfile: { bizNo: '123-45-67890', grade: 'sole' },
  ownerContact: {
    name: '김담당', email: 'owner@example.com', phone: '010-1234-5678', emailVerified: true,
    signupSource: {
      _v: 1, utmSource: 'naver', utmMedium: 'search', utmCampaign: 'launch',
      utmTerm: '결제서비스', utmContent: 'banner', referrer: 'https://naver.com/',
      landingPath: '/signup', capturedAt: '2026-10-19T00:00:00Z',
    },
  },
  canWriteNotes: true,
  revalidatePath: '/buyers/buyer-1',
};

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isValidElement<{ children?: ReactNode }>(node)) return '';
  return textOf(node.props.children);
}

function findNoteForms(node: ReactNode): Array<ComponentProps<typeof ActionForm>> {
  if (Array.isArray(node)) return node.flatMap(findNoteForms);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === ActionForm) return [node.props as ComponentProps<typeof ActionForm>];
  return findNoteForms(node.props.children);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notes.mockResolvedValue([{ id: 'note-1', createdBy: 'ops@example.com', createdAt: new Date(), body: '사업자 확인 완료' }]);
  mocks.history.mockResolvedValue([{ id: 'history-1', actor: 'ops@example.com', occurredAt: new Date(), payloadJson: { after: { status: 'approved' }, reason: '증빙 확인' } }]);
  mocks.create.mockResolvedValue({ ok: true });
});

describe('WorkspaceReviewInfo', () => {
  it('심사 정보, 사업자 및 담당자 정보, 전체 유입 정보와 노트를 표시한다', async () => {
    const tree = await WorkspaceReviewInfo(props);
    const text = textOf(tree);
    for (const value of ['신청 정보', '처리 이력', '증빙 확인', '123-45-67890', '김담당',
      'owner@example.com', '010-1234-5678', '이메일 인증됨', 'naver', 'search', 'launch',
      '결제서비스', 'banner', 'https://naver.com/', '/signup', '캡처 시각', '사업자 확인 완료']) {
      expect(text).toContain(value);
    }
    expect(mocks.history).toHaveBeenCalledWith('application-1');
    expect(mocks.notes).toHaveBeenCalledWith('workspace', 'buyer-1');
  });

  it('구매사 화면에서 저장하는 노트는 해당 워크스페이스에 연결하고 현재 화면을 갱신한다', async () => {
    const tree = await WorkspaceReviewInfo(props);
    const [form] = findNoteForms(tree);
    const data = new FormData();
    data.set('body', '  추가 확인  ');
    await form.action({ status: 'idle' }, data);
    expect(mocks.create).toHaveBeenCalledWith(undefined, 'workspace', 'buyer-1', '추가 확인', '/buyers/buyer-1');
  });

  it('신청·프로필·담당자 정보가 없어도 표시하며 노트 작성 권한을 적용한다', async () => {
    mocks.notes.mockResolvedValue([]);
    const tree = await WorkspaceReviewInfo({ ...props, application: null, bizProfile: null, ownerContact: null, canWriteNotes: false });
    expect(textOf(tree)).toContain('유입 정보 없음');
    expect(textOf(tree)).toContain('노트가 없습니다.');
    expect(mocks.history).not.toHaveBeenCalled();
    expect(findNoteForms(tree)).toHaveLength(0);
  });
});
