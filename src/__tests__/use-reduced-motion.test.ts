import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from '@/lib/hooks/use-reduced-motion'

function stubMatchMedia(matches: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(cb)
      if (idx >= 0) listeners.splice(idx, 1)
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  })
  return { mql, listeners }
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts as false and reflects the media query', async () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('stays false when media query is not reduced', async () => {
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(false))
  })
})
