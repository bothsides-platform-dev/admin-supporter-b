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
      const Component = node.type as (props: unknown) => ReactNode;
      return textOf(Component(node.props));
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

  it('구간이 모두 비어있는 요율 맵도 —로 표시한다 (미제출과 동일하게 fail-safe)', () => {
    const bid = baseBid({ paymentFees: { card: {} } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['card'], customPaymentMethods: [] }),
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

  it('requiredPaymentMethods 에 중복이 있어도 행을 한 번만 렌더한다 (key 충돌 방지)', () => {
    const bid = baseBid({ paymentFees: { card: 0.01 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['card', 'card'], customPaymentMethods: [] }),
    );
    expect(text.match(/카드/g)).toHaveLength(1);
  });

  it('어휘에 없는 결제수단 키가 와도 원문 키로 렌더한다 (fail-open)', () => {
    const bid = baseBid({ paymentFees: { unknown_method: 0.03 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: ['unknown_method'], customPaymentMethods: [] }),
    );
    expect(text).toContain('unknown_method');
  });

  it('커스텀 결제수단은 RFP가 정의한 라벨로 렌더한다', () => {
    const bid = baseBid({ customFees: { 'custom-1': 0.02 } });
    const text = textOf(
      BidFeeMatrix({
        bids: [bid],
        requiredPaymentMethods: [],
        customPaymentMethods: [{ id: 'custom-1', label: '네이버 스마트스토어' }],
      }),
    );
    expect(text).toContain('네이버 스마트스토어');
    expect(text).toContain('2.00%');
  });

  it('customPaymentMethods에 라벨이 없으면 id를 그대로 보여준다 (fail-open)', () => {
    const bid = baseBid({ customFees: { 'unknown-id': 0.03 } });
    const text = textOf(
      BidFeeMatrix({ bids: [bid], requiredPaymentMethods: [], customPaymentMethods: [] }),
    );
    expect(text).toContain('unknown-id');
  });

  it('RFP가 요청한 커스텀 수단을 아무도 제출하지 않아도 행 자체는 노출한다 (누락과 미노출을 구분)', () => {
    const bid = baseBid({ customFees: {} });
    const text = textOf(
      BidFeeMatrix({
        bids: [bid],
        requiredPaymentMethods: [],
        customPaymentMethods: [{ id: 'custom-1', label: '제로 제출 수단' }],
      }),
    );
    expect(text).toContain('제로 제출 수단');
    expect(text).toContain('—');
  });

  it('null/false/문자열 등 잘못된 fee 값은 0%가 아니라 —로 표시한다 (가짜 수수료 방지)', () => {
    const bid = baseBid({
      paymentFees: { card: null as unknown as number, gift_card: false as unknown as number },
      customFees: { 'custom-1': null as unknown as number },
    });
    const text = textOf(
      BidFeeMatrix({
        bids: [bid],
        requiredPaymentMethods: ['card', 'gift_card'],
        customPaymentMethods: [{ id: 'custom-1', label: '기타수단' }],
      }),
    );
    expect(text).not.toContain('0.00%');
    // 카드/상품권/기타수단 3행 모두 —여야 한다.
    expect((text.match(/—/g) ?? []).length).toBe(3);
  });

  it('일부 견적만 커스텀 수단을 제출했으면 나머지 열은 —로 표시한다', () => {
    const submitted = baseBid({ id: 'bid-1', customFees: { 'custom-1': 0.02 } });
    const notSubmitted = baseBid({ id: 'bid-2', customFees: {} });
    const text = textOf(
      BidFeeMatrix({
        bids: [submitted, notSubmitted],
        requiredPaymentMethods: [],
        customPaymentMethods: [{ id: 'custom-1', label: '기타수단' }],
      }),
    );
    expect(text).toContain('기타수단');
    expect(text).toContain('—');
  });
});
