import { describe, expect, test } from 'bun:test'
import {
  addIfcReferenceNode,
  createIfcFallbackGraph,
  filterIfcMeshModel,
  type IfcMeshModel,
} from './ifc-mesh'

function primitive(expressId: number, storeyExpressId?: number) {
  return {
    expressId,
    geometryExpressId: expressId + 100,
    ifcType: 'IFCBUILDINGELEMENTPROXY',
    name: `Product ${expressId}`,
    storeyExpressId,
    color: [1, 1, 1, 1] as [number, number, number, number],
    positions: new Float32Array([expressId, 0, 0, expressId + 1, 0, 0, expressId, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  }
}

const model: IfcMeshModel = {
  primitives: [primitive(1, 10), primitive(2, 20), primitive(3)],
  bounds: { min: [1, 0, 0], max: [4, 1, 0] },
  elementCount: 3,
  triangleCount: 3,
  unitFactor: 1,
}

describe('faithful IFC geometry', () => {
  test('filters storey-bound products while retaining unassigned products', () => {
    const filtered = filterIfcMeshModel(model, new Set([20]), new Set([3]))
    expect(filtered.primitives.map((entry) => entry.expressId)).toEqual([2])
    expect(filtered.elementCount).toBe(1)
    expect(filtered.triangleCount).toBe(1)
  })

  test('creates reviewable levels when semantic inference fails', () => {
    const graph = createIfcFallbackGraph(model)
    const levels = Object.values(graph.nodes).filter((node) => node.type === 'level')
    expect(levels).toHaveLength(2)
    expect(levels.map((level) => level.metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expressID: 10 }),
        expect.objectContaining({ expressID: 20 }),
      ]),
    )
  })

  test('adds a portable scan reference beneath the imported building', () => {
    const graph = addIfcReferenceNode(
      {
        nodes: {
          building_test: {
            object: 'node',
            id: 'building_test',
            type: 'building',
            parentId: null,
            children: [],
          },
        },
        rootNodeIds: ['building_test'],
      },
      model,
    )
    const scan = Object.values(graph.nodes).find((node) => node.type === 'scan')
    expect(scan?.url).toBe('asset://embedded/ifc-model.glb')
    expect(scan?.metadata).toEqual(expect.objectContaining({ preservedElements: 3, triangles: 3 }))
  })
})
