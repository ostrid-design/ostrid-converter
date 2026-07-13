import { describe, expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'
import { createComponentBundle } from './component-bundle'
import type { GraphComponent } from './graph-component'

describe('Ostrid component bundle', () => {
  test('contains the component manifest and preserved GLB asset', () => {
    const now = new Date().toISOString()
    const component = {
      object: 'graph-component',
      schemaVersion: 1,
      id: 'graph_component_bundle_test',
      name: 'Bundle test',
      version: 1,
      kind: 'selection',
      graph: { nodes: { node_test: {} }, rootNodeIds: ['node_test'] },
      source: { format: 'ifc', fileName: 'test.ifc', converter: 'test', options: {} },
      createdAt: now,
      updatedAt: now,
    } satisfies GraphComponent
    const archive = unzipSync(createComponentBundle(component, new Uint8Array([1, 2, 3, 4])))
    expect(JSON.parse(strFromU8(archive['component.json'])).name).toBe('Bundle test')
    expect([...archive['assets/ifc-model.glb']]).toEqual([1, 2, 3, 4])
  })

  test('packages arbitrary embedded component assets', () => {
    const now = new Date().toISOString()
    const component = {
      object: 'graph-component',
      schemaVersion: 1,
      id: 'graph_component_guide_test',
      name: 'Guide bundle',
      version: 1,
      kind: 'building',
      graph: { nodes: { building: {} }, rootNodeIds: ['building'] },
      source: { format: 'image', fileName: 'plan.png', converter: 'test', options: {} },
      createdAt: now,
      updatedAt: now,
    } satisfies GraphComponent
    const archive = unzipSync(
      createComponentBundle(component, { 'source-page-1.jpg': new Uint8Array([9, 8, 7]) }),
    )
    expect([...archive['assets/source-page-1.jpg']]).toEqual([9, 8, 7])
  })
})
