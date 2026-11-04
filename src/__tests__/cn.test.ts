import { describe, expect, it } from 'vitest'
import { cn } from '@/utils/cn'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b')
  })

  it('flattens arrays and objects', () => {
    expect(cn(['a', 'c'], { b: true, d: false })).toBe('a c b')
  })
})
