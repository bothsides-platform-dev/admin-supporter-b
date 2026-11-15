import { describe, expect, it } from 'vitest';
import { HUMAN_ACTIONS, excludedEmailDomains, isExcludedEmail, isTestWorkspaceName } from '../rules';

describe('테스트 워크스페이스 판정', () => {
  it('이름에 test 또는 테스트가 들어 있으면 테스트로 본다', () => {
    expect(isTestWorkspaceName('Test PG')).toBe(true);
    expect(isTestWorkspaceName('테스트상사')).toBe(true);
    expect(isTestWorkspaceName('알파상사')).toBe(false);
  });

  it('부분 문자열 규칙이라 상호에 토큰이 우연히 든 곳도 제외된다 (bidit 과 같은 수용된 오탐)', () => {
    expect(isTestWorkspaceName('Contest Korea')).toBe(true);
  });
});

describe('내부 이메일 도메인', () => {
  it('쉼표 목록을 소문자 도메인으로 정리한다', () => {
    expect(excludedEmailDomains(' Example.com, @corp.kr ,')).toEqual(['example.com', 'corp.kr']);
    expect(excludedEmailDomains(undefined)).toEqual([]);
    expect(excludedEmailDomains('')).toEqual([]);
  });

  it('도메인이 정확히 일치할 때만 내부 계정으로 본다', () => {
    const domains = ['example.com'];
    expect(isExcludedEmail('ops@EXAMPLE.com', domains)).toBe(true);
    expect(isExcludedEmail('ops@sub.example.com', domains)).toBe(false);
    expect(isExcludedEmail('ops@example.com.kr', domains)).toBe(false);
    expect(isExcludedEmail('no-at-sign', domains)).toBe(false);
    expect(isExcludedEmail('ops@example.com', [])).toBe(false);
  });
});

describe('활동으로 인정하는 행동', () => {
  it('가입 때 자동으로 남는 기록과 공급자가 남기는 기록은 넣지 않는다', () => {
    const actions: readonly string[] = HUMAN_ACTIONS;
    expect(actions).toContain('rfp.create');
    expect(actions).toContain('bid.submit');
    expect(actions).not.toContain('workspace.create');
    expect(actions).not.toContain('workspace.invite_accept');
    expect(actions).not.toContain('signing.completed');
    expect(actions.some((action) => action.startsWith('auth.'))).toBe(false);
  });
});
