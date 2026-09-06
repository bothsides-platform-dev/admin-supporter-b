import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKST(date: string | Date): string {
  return new Date(date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

export function formatDateKST(date: string | Date): string {
  return new Date(date).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}

// bidit(lib/utils/format.ts)와 동일 구현 — admin 최초의 금액/요율 포맷터.
// numeric(precision,scale) 컬럼은 drizzle-orm 이 문자열로 돌려주므로 호출부에서
// Number(...)로 변환한 뒤 넘긴다.
export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원'
}

export function formatPct(value: number, digits = 2): string {
  return (value * 100).toFixed(digits) + '%'
}

// 스킴 검증 없이 저장된 자유입력 URL(예: rfp.websiteUrl)을 href 에 그대로
// 넣으면 javascript:/data: 스킴이 admin 세션에서 실행될 수 있다 — 렌더 전 반드시
// 이 함수로 http/https 만 통과시킨다.
export function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}
