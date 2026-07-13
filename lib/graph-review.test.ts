import { describe, expect, test } from 'bun:test'
import {
  applyGraphReview,
  countGraphObjects,
  emptyGraphReview,
  patchReviewNode,
  removeReviewNode,
} from './graph-review'

const graph = {
  nodes: {
    building: { id: 'building', type: 'building', parentId: null, children: ['level'] },
    level: { id: 'level', type: 'level', parentId: 'building', children: ['wall'] },
    wall: { id: 'wall', type: 'wall', parentId: 'level', children: ['door'], name: 'Wall' },
    door: { id: 'door', type: 'door', parentId: 'wall', children: [] },
  },
  rootNodeIds: ['building'],
}

describe('graph review', () => {
  test('patches nodes and attaches added children', () => {
    let review = emptyGraphReview()
    review = patchReviewNode(review, 'wall', { name: 'Kitchen wall', visible: false })
    review.addedNodes.annotation = {
      id: 'annotation',
      type: 'annotation',
      parentId: 'level',
      children: [],
    }
    const reviewed = applyGraphReview(graph, review)
    expect(reviewed.nodes.wall?.name).toBe('Kitchen wall')
    expect(reviewed.nodes.wall?.visible).toBe(false)
    expect(reviewed.nodes.level?.children).toContain('annotation')
    expect(countGraphObjects(reviewed).annotations).toBe(1)
  })

  test('removes a node and all descendants', () => {
    const reviewed = applyGraphReview(graph, removeReviewNode(emptyGraphReview(), 'wall'))
    expect(reviewed.nodes.wall).toBeUndefined()
    expect(reviewed.nodes.door).toBeUndefined()
    expect(reviewed.nodes.level?.children).toEqual([])
  })
})
