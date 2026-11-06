import { describe, expect, it } from 'vitest';
import { costText, conditionText } from './quote-display';
describe('v2 quote display', () => {
  it('preserves legacy zero and missing values', () => {
    expect(costText({_v:1}, 'signupFee', 0)).toBe('0원');
    expect(costText({_v:1}, 'signupFee', null)).toBe('미입력');
  });
  it('uses v2 states instead of legacy projections', () => {
    for (const [state, label] of [['unset','미입력'], ['negotiable','협의 필요'], ['not_applicable','해당 없음']])
      expect(costText({_v:2, signupFee:{state}}, 'signupFee', 0)).toBe(label);
    expect(conditionText({state:'confirmed',value:0})).toBe('0원');
    expect(conditionText({state:'confirmed',value:0.01234567}, 'rate')).toBe('1.234567%');
    expect(conditionText({state:'confirmed',value:null})).toBe('미입력');
  });
});
