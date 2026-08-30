import { describe, expect, it } from 'vitest'
import { buildPinnedSection } from './pinned'
import { ChannelNode } from './types'

const n = (id: string, kind: ChannelNode['kind'], parentId: string | null = null): ChannelNode =>
  ({ id, name: id, kind, parentId, position: 0 })

const nodes = [n('cat', 'category'), n('gen', 'text', 'cat'), n('t1', 'thread', 'gen'), n('t2', 'thread', 'gen'), n('other', 'text', 'cat'), n('v', 'voice', 'cat')]

describe('buildPinnedSection', () => {
  it('pinned channel brings its threads as children', () => {
    expect(buildPinnedSection(nodes, ['gen'])).toEqual([{ node: nodes[1], children: [nodes[2], nodes[3]] }])
  })
  it('pinned thread stands alone', () => {
    expect(buildPinnedSection(nodes, ['t2'])).toEqual([{ node: nodes[3], children: [] }])
  })
  it('preserves pin order', () => {
    expect(buildPinnedSection(nodes, ['other', 'gen']).map((e) => e.node.id)).toEqual(['other', 'gen'])
  })
  it('skips unknown ids and non-pinnable kinds', () => {
    expect(buildPinnedSection(nodes, ['ghost', 'cat', 'v'])).toEqual([])
  })
  it('skips a standalone thread pin when its parent channel is also pinned', () => {
    expect(buildPinnedSection(nodes, ['gen', 't1'])).toEqual([{ node: nodes[1], children: [nodes[2], nodes[3]] }])
    expect(buildPinnedSection(nodes, ['t1', 'gen'])).toEqual([{ node: nodes[1], children: [nodes[2], nodes[3]] }])
  })
  it('dedupes repeated ids in the pin list', () => {
    expect(buildPinnedSection(nodes, ['gen', 'gen'])).toHaveLength(1)
  })
  it('never yields a duplicate id across entries and children', () => {
    const section = buildPinnedSection(nodes, ['gen', 't1', 't2', 'other'])
    const ids = section.flatMap((e) => [e.node.id, ...e.children.map((c) => c.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })
})
