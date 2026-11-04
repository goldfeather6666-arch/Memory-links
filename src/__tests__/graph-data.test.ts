import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ORDER,
  EDGE_COUNT,
  EDGES,
  NODE_COUNT,
  NODES,
} from '@/lib/data/graph-data'

describe('graph-data', () => {
  it('generates the expected node and edge counts', () => {
    expect(NODE_COUNT).toBe(220)
    expect(EDGE_COUNT).toBe(260)
  })

  it('covers every category', () => {
    const categories = new Set(NODES.map((n) => n.category))
    for (const c of CATEGORY_ORDER) {
      expect(categories.has(c)).toBe(true)
    }
  })

  it('uses unique ids', () => {
    const ids = NODES.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps nodes within a bounded range and weights in 0..1', () => {
    for (const n of NODES) {
      expect(Math.abs(n.x)).toBeLessThanOrEqual(8)
      expect(Math.abs(n.y)).toBeLessThanOrEqual(8)
      expect(Math.abs(n.z)).toBeLessThanOrEqual(8)
      expect(n.weight).toBeGreaterThanOrEqual(0)
      expect(n.weight).toBeLessThanOrEqual(1)
    }
  })

  it('references valid node ids in edges', () => {
    for (const e of EDGES) {
      expect(e.source).toBeGreaterThanOrEqual(0)
      expect(e.source).toBeLessThan(NODE_COUNT)
      expect(e.target).toBeGreaterThanOrEqual(0)
      expect(e.target).toBeLessThan(NODE_COUNT)
      expect(e.source).not.toBe(e.target)
    }
  })
})
