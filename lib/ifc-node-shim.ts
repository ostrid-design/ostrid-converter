export const DEFAULT_WALL_HEIGHT = 2.8
export const DEFAULT_WALL_THICKNESS = 0.18

export type AnyNodeId = string

type BaseNode = {
  object: 'node'
  id: string
  type: string
  name?: string
  parentId?: string | null
  visible: boolean
  metadata?: unknown
  children?: string[]
  [key: string]: unknown
}

export type WallNode = BaseNode & {
  type: 'wall'
  start: [number, number]
  end: [number, number]
  height: number
  thickness: number
  children: string[]
  curveOffset?: number
}

export type DoorNode = BaseNode & {
  type: 'door'
  position: [number, number, number]
  width?: number
  height?: number
  wallId?: string
}

export type WindowNode = BaseNode & {
  type: 'window'
  position: [number, number, number]
  width?: number
  height?: number
  wallId?: string
}

type OtherNode = BaseNode & {
  type: 'site' | 'building' | 'level' | 'slab' | 'stair' | 'roof' | 'column' | 'item'
}

export type AnyNode = WallNode | DoorNode | WindowNode | OtherNode

type NodeSchema<T extends AnyNode> = { parse: (input: unknown) => T }

function schema<T extends AnyNode>(): NodeSchema<T> {
  return {
    parse(input) {
      return input as T
    },
  }
}

export const SiteNode = schema<OtherNode>()
export const BuildingNode = schema<OtherNode>()
export const LevelNode = schema<OtherNode>()
export const WallNode = schema<WallNode>()
export const DoorNode = schema<DoorNode>()
export const WindowNode = schema<WindowNode>()
export const SlabNode = schema<OtherNode>()
export const StairNode = schema<OtherNode>()
export const RoofNode = schema<OtherNode>()
export const ColumnNode = schema<OtherNode>()
