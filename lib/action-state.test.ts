import { describe, expect, it } from 'vitest';
import { actionFailure, actionSuccess, toActionState } from './action-state';

describe('toActionState', () => {
  it('성공 결과는 전달한 성공 메시지로 변환한다', () => {
    expect(toActionState({ ok: true }, '저장했습니다.')).toEqual({
      status: 'success',
      message: '저장했습니다.',
    });
  });

  it('알려진 에러 코드는 한국어 메시지로 변환한다', () => {
    expect(toActionState({ ok: false, error: 'LAST_ADMIN' }, '무시됨')).toEqual({
      status: 'error',
      message: '마지막 관리자는 제외할 수 없습니다.',
    });
  });

  it('모르는 에러 코드는 기본 실패 메시지로 변환한다', () => {
    expect(actionFailure('SOMETHING_NEW')).toEqual({
      status: 'error',
      message: '처리에 실패했습니다. 다시 시도해 주세요.',
    });
  });

  it('actionSuccess는 메시지를 그대로 담는다', () => {
    expect(actionSuccess('완료')).toEqual({ status: 'success', message: '완료' });
  });
});
