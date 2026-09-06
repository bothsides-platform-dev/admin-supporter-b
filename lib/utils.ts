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
