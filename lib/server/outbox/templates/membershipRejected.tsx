import * as React from 'react';
import { render } from '@react-email/render';

import { Layout, Mono } from './_layout';

export interface MembershipRejectedProps {
  workspaceName: string;
}

export function MembershipRejected({
  workspaceName,
}: MembershipRejectedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`'${workspaceName}' 담당자 계정 합류 요청 결과 안내.`}
      serial="MEMBERSHIP / REJECTED"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        담당자 계정 합류 요청 결과 안내
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>
        의 담당자 계정 합류 요청이 처리되었습니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        자세한 내용은 관리자에게 문의하거나, 우측 하단 채널톡을 이용해 주세요.
      </p>
    </Layout>
  );
}

export async function renderMembershipRejected(
  props: MembershipRejectedProps,
): Promise<string> {
  return render(<MembershipRejected {...props} />);
}
