import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useMediaQuery } from './use-media-query';

function stubMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null;
  const mql = {
    matches: initial,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listener = cb; },
    removeEventListener: () => { listener = null; },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return {
    fire: (matches: boolean) => { mql.matches = matches; listener?.({ matches }); },
  };
}

describe('useMediaQuery', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('reflects the initial match after mount', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const { fire } = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 1024px)'));
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
  });
});
