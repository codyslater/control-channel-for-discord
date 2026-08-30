import { ChannelNode } from './types'

export interface PinnedEntry {
  node: ChannelNode
  children: ChannelNode[]
}

/** Assembles the 📌 Pinned section: entries in pin order; a pinned text channel
 *  brings its threads, a pinned thread stands alone; unknown ids and
 *  category/voice kinds are skipped. Caller passes an already hidden-filtered
 *  node list. */
export function buildPinnedSection(nodes: ChannelNode[], pinnedIds: string[]): PinnedEntry[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const unique = [...new Set(pinnedIds)]
  const pinnedSet = new Set(unique)
  const out: PinnedEntry[] = []
  for (const id of unique) {
    const node = byId.get(id)
    if (!node || node.kind === 'category' || node.kind === 'voice') continue
    // A thread whose parent channel is also pinned already appears nested under
    // it — a standalone entry would duplicate the tree item id.
    if (node.kind === 'thread' && node.parentId && pinnedSet.has(node.parentId)) continue
    const children = node.kind === 'text' ? nodes.filter((t) => t.kind === 'thread' && t.parentId === id) : []
    out.push({ node, children })
  }
  return out
}
