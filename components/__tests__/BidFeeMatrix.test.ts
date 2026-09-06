import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { BidFeeMatrix, type FeeMatrixBid } from '../BidFeeMatrix';

// AdminShell.test.ts 와 동일한 방식 — 컴포넌트를 함수로 직접 호출해 반환된
// React 엘리먼트 트리에서 문자열만 뽑아 이어붙인다. 훅을 쓰지 않는 순수
// 프레젠테이션 컴포넌트(BidFeeMatrix·AdminStatusBadge·Chip)라 렌더러 없이 검증 가능.
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    // 클래스 컴포넌트가 아닌 함수 컴포넌트는 직접 호출해 하위 트리를 얻는다.
    if (typeof node.type === 'function') {
      return textOf((node.type as any)(node.props));
    }
    return textOf(props.children);
  }
  return '';
}

function baseBid(overrides: Partial<FeeMatrixBid>): FeeMatrixBid {
  return {
    id: 'bid-1',
    pgWsName: 'PG사',
    round: 1,
    status: 'submitted',
    paymentFees: {},
    customFees: {},
    ...overrides,
  };
}

describe('BidFeeMatrix', () => {
  it('견적이 없으면 아무것도 렌더하지 않는다', () => {
    expect(BidFeeMatrix({ bids: [], requiredPaymentMethods: [], customPaymentMethods: [] })).toBeNull();
  });

  it('구간맵은 정의된 구간만 %로, 정액 수단은 건당 원으로 렌더한다', () => {
    const bid = baseBid({
      paymentFees: {
        card: { sole: 0.005, general: 0.028 },
        virtual_account: 300,
      },
    });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['card', 'virtual_account'], customPaymentMethods: [] }),
    );
    expect(text).toContain('영세');
    expect(text).toContain('0.50%');
    expect(text).toContain('2.80%');
    expect(text).toContain('300원');
    expect(text).toContain('건당');
  });

  it('제출하지 않은 결제수단은 —로 표시한다 (fail-safe, 빈칸 아님)', () => {
    const bid = baseBid({ paymentFees: { card: 0.01 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['card', 'bank_transfer'], customPaymentMethods: [] }),
    );
    expect(text).toContain('—');
  });

  it('같은 PG의 1차·2차 견적을 각각 별도 열로 렌더한다', () => {
    const round1 = baseBid({ id: 'bid-1', round: 1 });
    const round2 = baseBid({ id: 'bid-2', round: 2 });
    const rendered = BidFeeMatrix({
      bids: [round1, round2],
      requiredPaymentMethods: [],
      customPaymentMethods: [],
    });
    const text = textOf(rendered);
    expect(text).toContain('1차');
    expect(text).toContain('2차');
  });

  it('요청 결제수단이 비어있어도(제한 없음) 견적이 제출한 수단은 행으로 나온다', () => {
    const bid = baseBid({ paymentFees: { card: 0.01 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: [], customPaymentMethods: [] }),
    );
    expect(text).toContain('카드');
    expect(text).toContain('1.00%');
  });

  it('어휘에 없는 결제수단 키가 와도 원문 키로 렌더한다 (fail-open)', () => {
    const bid = baseBid({ paymentFees: { unknown_method: 0.03 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['unknown_method'], customPaymentMethods: [] }),
    );
    expect(text).toContain('unknown_method');
  });
});
