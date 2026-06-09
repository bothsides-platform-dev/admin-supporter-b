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
