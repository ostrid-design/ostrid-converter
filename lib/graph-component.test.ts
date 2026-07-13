import { describe, expect, test } from 'bun:test'
import { createGraphComponent, GraphComponentSchema } from './graph-component'

describe('GraphComponent output', () => {
  test('creates a versioned building artifact', () => {
    const graph = {
      nodes: {
        building_a: { object: 'node', id: 'building_a', type: 'building', parentId: null },
      },
      rootNodeIds: ['building_a'],
    }
    const component = createGraphComponent({
      name: 'House',
      graph,
      source: { format: 'dwg', fileName: 'house.dwg', converter: 'test', options: {} },
    })
    expect(GraphComponentSchema.safeParse(component).success).toBe(true)
    expect(component.kind).toBe('building')
  })
})
