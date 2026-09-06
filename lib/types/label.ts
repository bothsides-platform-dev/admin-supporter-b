/**
 * 관대한(fail-open) 라벨 조회의 단일 구현. 어휘에 없는 키는 원문을 그대로
 * 반환한다 — admin 의 어휘 사본이 원본(bidit)보다 뒤처져도 빈 칸 대신 원문
 * 키를 보여준다. `Object.hasOwn` 필수 — 맵 조회가 프로토타입 체인을 타면
 * 'constructor'·'toString' 같은 저장값이 함수를 돌려주고 원문 폴백이 발동하지
 * 않는다(화면에 함수가 문자열로 샌다).
 */
export function labelOf<T extends string>(labels: Record<T, string>, key: string): string {
  return Object.hasOwn(labels, key) ? labels[key as T] : key;
}
