import { describe, expect, test } from 'bun:test'
import { simplifyConvertedSceneGraph } from './ifc-cleanup'
import type { AnyNode } from './ifc-node-shim'

function level(children: string[]): AnyNode {
  return {
    object: 'node',
    id: 'level_1',
    type: 'level',
    name: 'Level',
    parentId: null,
    visible: true,
    level: 0,
    children,
  }
}

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  children: string[] = [],
): AnyNode {
  return {
    object: 'node',
    id,
    type: 'wall',
    name: id,
    parentId: 'level_1',
    visible: true,
    start,
    end,
    thickness: 0.2,
    height: 3,
    children,
    frontSide: 'unknown',
    backSide: 'unknown',
  }
}

function opening(
  type: 'door' | 'window',
  id: string,
  parentId: string,
  position: [number, number, number],
): AnyNode {
  return {
    object: 'node',
    id,
    type,
    name: id,
    parentId,
    wallId: parentId,
    visible: true,
    width: type === 'door' ? 0.9 : 1,
    height: type === 'door' ? 2.1 : 1.2,
    position,
  }
}

describe('IFC graph simplification', () => {
  test('merges collinear wall fragments across door-sized gaps', () => {
    const nodes: Record<string, AnyNode> = {
      level_1: level(['wall_a', 'wall_b']),
      wall_a: wall('wall_a', [0, 0], [2, 0]),
      wall_b: wall('wall_b', [2.9, 0], [5, 0]),
    }
    const stats = simplifyConvertedSceneGraph(nodes)
    expect(stats.removedMergedWalls).toBe(1)
    const keptWall = Object.values(nodes).find((node) => node.type === 'wall')
    expect(keptWall).toMatchObject({ start: [0, 0], end: [5, 0] })
  })

  test('reprojects hosted openings onto a merged wall', () => {
    const nodes: Record<string, AnyNode> = {
      level_1: level(['wall_a', 'wall_b']),
      wall_a: wall('wall_a', [0, 0], [2, 0]),
      wall_b: wall('wall_b', [2, 0], [4, 0], ['window_1']),
      window_1: opening('window', 'window_1', 'wall_b', [1, 1.4, 0]),
    }
    simplifyConvertedSceneGraph(nodes)
    const keptWall = Object.values(nodes).find((node) => node.type === 'wall')
    expect(nodes.window_1).toMatchObject({
      parentId: keptWall?.id,
      wallId: keptWall?.id,
      position: [3, 1.4, 0],
    })
  })

  test('removes duplicate hosted openings', () => {
    const nodes: Record<string, AnyNode> = {
      level_1: level(['wall_1']),
      wall_1: wall('wall_1', [0, 0], [4, 0], ['door_1', 'door_2']),
      door_1: opening('door', 'door_1', 'wall_1', [1.5, 1.05, 0]),
      door_2: opening('door', 'door_2', 'wall_1', [1.51, 1.05, 0]),
    }
    const stats = simplifyConvertedSceneGraph(nodes)
    expect(stats.removedDuplicateOpenings).toBe(1)
    expect(nodes.door_1).toBeDefined()
    expect(nodes.door_2).toBeUndefined()
  })
})
