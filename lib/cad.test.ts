import { describe, expect, test } from 'bun:test'
import { analyzeCadDocument, buildGraph, defaultCategories } from './cad'
import type { CadDocument } from './types'

const drawing: CadDocument = {
  entities: [
    { type: 'TEXT', layer: 'A-TEXT', text: 'GROUND FLOOR', startPoint: { x: 0, y: 0 } },
    { type: 'TEXT', layer: 'A-TEXT', text: 'FIRST FLOOR FLOOR', startPoint: { x: 100, y: 0 } },
    { type: 'LINE', layer: 'A-WALL', startPoint: { x: -5, y: -5 }, endPoint: { x: 5, y: -5 } },
    { type: 'LINE', layer: 'A-WALL', startPoint: { x: 95, y: -5 }, endPoint: { x: 105, y: -5 } },
    { type: 'ARC', layer: 'A-DOOR', center: { x: 0, y: -5 }, radius: 0.9 },
  ],
}

describe('CAD inference', () => {
  test('finds floor titles and creates a building GraphComponent hierarchy', () => {
    const analysis = analyzeCadDocument(drawing)
    expect(analysis.levels.map((level) => level.name)).toEqual(['Ground Floor', 'First Floor'])
    const result = buildGraph(drawing, {
      levels: analysis.levels,
      categories: { ...defaultCategories },
      metersPerUnit: 1,
      wallHeight: 2.8,
      wallThickness: 0.18,
    })
    const rootId = result.graph.rootNodeIds[0]
    expect(rootId).toBeDefined()
    const root = rootId ? result.graph.nodes[rootId] : undefined
    expect(root?.type).toBe('building')
    expect(root?.children).toHaveLength(2)
    expect(result.counts.walls).toBe(2)
  })
})
