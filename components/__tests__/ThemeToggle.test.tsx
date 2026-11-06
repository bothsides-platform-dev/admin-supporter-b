// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../ThemeToggle';

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'startViewTransition');
});

function renderToggle() {
  render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange storageKey="admin-theme">
      <ThemeToggle />
    </ThemeProvider>,
  );
  return screen.getByRole('button', { name: '테마 전환' });
}

describe('ThemeToggle', () => {
  it('View Transition 콜백이 끝나기 전에 <html> 테마 클래스를 바꾼다', () => {
    let classInsideCallback = '';
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      classInsideCallback = document.documentElement.className;
    });
    Object.defineProperty(document, 'startViewTransition', { value: startViewTransition, configurable: true });

    fireEvent.click(renderToggle());

    expect(startViewTransition).toHaveBeenCalledOnce();
    // 새 상태 스냅샷은 콜백 직후 찍히므로 이 시점에 이미 dark 여야 한다.
    expect(classInsideCallback).toContain('dark');
  });

  it('View Transition 을 지원하지 않으면 바로 테마를 바꾼다', () => {
    fireEvent.click(renderToggle());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
