import { describe, expect, it } from 'vitest';
import { isFlatFeeMethod, merchantTierLabel, paymentMethodLabel } from '../bid';

describe('paymentMethodLabel', () => {
  it('알려진 결제수단은 한글 라벨로 변환한다', () => {
    expect(paymentMethodLabel('card')).toBe('카드');
    expect(paymentMethodLabel('virtual_account')).toBe('가상계좌');
  });

  it('어휘에 없는 키는 원문을 그대로 반환한다 (fail-open)', () => {
    expect(paymentMethodLabel('crypto_pay')).toBe('crypto_pay');
  });
});

describe('merchantTierLabel', () => {
  it('알려진 등급은 한글 라벨로 변환한다', () => {
    expect(merchantTierLabel('sole')).toBe('영세');
    expect(merchantTierLabel('sme2')).toBe('중소2');
  });

  it('어휘에 없는 값은 원문을 그대로 반환한다 (fail-open)', () => {
    expect(merchantTierLabel('vip')).toBe('vip');
  });
});

describe('isFlatFeeMethod', () => {
  it('가상계좌는 정액(건당) 수단이다', () => {
    expect(isFlatFeeMethod('virtual_account')).toBe(true);
  });

  it('카드 등 정률 수단은 false', () => {
    expect(isFlatFeeMethod('card')).toBe(false);
  });
});
