import type { ImportCounts, PortableGraph } from './types'

export type GraphReview = {
  removedNodeIds: string[]
  nodePatches: Record<string, Record<string, unknown>>
  addedNodes: Record<string, Record<string, unknown>>
}

export const emptyGraphReview = (): GraphReview => ({
  removedNodeIds: [],
  nodePatches: {},
  addedNodes: {},
})

function childrenOf(node: Record<string, unknown> | undefined) {
  return Array.isArray(node?.children)
    ? node.children.filter((id): id is string => typeof id === 'string')
    : []
}

export function applyGraphReview(source: PortableGraph, review: GraphReview): PortableGraph {
  const nodes = structuredClone(source.nodes)
  for (const [id, node] of Object.entries(review.addedNodes)) nodes[id] = structuredClone(node)
  for (const [id, patch] of Object.entries(review.nodePatches)) {
    if (nodes[id]) nodes[id] = { ...nodes[id], ...structuredClone(patch) }
  }

  const removed = new Set<string>()
  const removeWithChildren = (id: string) => {
    if (removed.has(id)) return
    removed.add(id)
    childrenOf(nodes[id]).forEach(removeWithChildren)
  }
  review.removedNodeIds.forEach(removeWithChildren)
  for (const id of removed) delete nodes[id]

  for (const [id, node] of Object.entries(nodes)) {
    const parentId = typeof node.parentId === 'string' ? node.parentId : null
    const sourceChildren = childrenOf(node).filter((childId) => Boolean(nodes[childId]))
    const addedChildren = Object.values(nodes)
      .filter((candidate) => candidate.parentId === id && typeof candidate.id === 'string')
      .map((candidate) => String(candidate.id))
    node.children = [...new Set([...sourceChildren, ...addedChildren])]
    if (parentId && !nodes[parentId]) node.parentId = null
  }

  return {
    ...source,
    nodes,
    rootNodeIds: source.rootNodeIds.filter((id) => Boolean(nodes[id])),
  }
}

export function countGraphObjects(graph: PortableGraph): ImportCounts {
  const counts: ImportCounts = {
    walls: 0,
    openings: 0,
    dimensions: 0,
    zones: 0,
    annotations: 0,
    furniture: 0,
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.type === 'wall') counts.walls += 1
    if (node.type === 'door' || node.type === 'window') counts.openings += 1
    if (node.type === 'dimension') counts.dimensions += 1
    if (node.type === 'zone' || node.type === 'slab') counts.zones += 1
    if (node.type === 'annotation') counts.annotations += 1
    if (node.type === 'item') counts.furniture += 1
  }
  return counts
}

export function patchReviewNode(
  review: GraphReview,
  id: string,
  patch: Record<string, unknown>,
): GraphReview {
  if (review.addedNodes[id]) {
    return {
      ...review,
      addedNodes: {
        ...review.addedNodes,
        [id]: { ...review.addedNodes[id], ...patch },
      },
    }
  }
  return {
    ...review,
    nodePatches: {
      ...review.nodePatches,
      [id]: { ...review.nodePatches[id], ...patch },
    },
  }
}

export function removeReviewNode(review: GraphReview, id: string): GraphReview {
  if (review.addedNodes[id]) {
    const addedNodes = { ...review.addedNodes }
    delete addedNodes[id]
    return { ...review, addedNodes }
  }
  return review.removedNodeIds.includes(id)
    ? review
    : { ...review, removedNodeIds: [...review.removedNodeIds, id] }
}
