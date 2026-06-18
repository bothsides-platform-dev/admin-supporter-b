import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';

export interface MembershipApprovedProps {
  workspaceName: string;
  loginUrl: string;
}

export function MembershipApproved({
  workspaceName,
  loginUrl,
}: MembershipApprovedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`'${workspaceName}' 담당자 계정이 승인되었습니다.`}
      serial="MEMBERSHIP / APPROVED"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        담당자 계정 승인 안내
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>
        의 담당자 계정 합류 요청이 승인되었습니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        지금 바로 로그인해 서비스를 시작하세요.
      </p>

      <Button href={loginUrl}>로그인하고 시작하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{loginUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderMembershipApproved(
  props: MembershipApprovedProps,
): Promise<string> {
  return render(<MembershipApproved {...props} />);
}
