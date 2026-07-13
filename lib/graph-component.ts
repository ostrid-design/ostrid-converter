import { z } from 'zod'
import type { PortableGraph } from './types'

export const GRAPH_COMPONENT_SCHEMA_VERSION = 1

export const GraphComponentSchema = z.object({
  object: z.literal('graph-component'),
  schemaVersion: z.literal(GRAPH_COMPONENT_SCHEMA_VERSION),
  id: z.string().regex(/^graph_component_[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
  kind: z.enum(['building', 'level', 'selection']),
  graph: z.object({
    nodes: z.record(z.string(), z.json()),
    rootNodeIds: z.array(z.string()).min(1),
    collections: z.record(z.string(), z.json()).optional(),
    materials: z.record(z.string(), z.json()).optional(),
  }),
  source: z.object({
    format: z.enum(['dwg', 'dxf', 'ifc', 'pdf', 'image', 'ostrid']),
    fileName: z.string().min(1).max(500),
    converter: z.string().min(1).max(200),
    options: z.record(z.string(), z.json()).default({}),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  preview: z
    .object({
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
      depth: z.number().nonnegative(),
      nodeCount: z.number().int().nonnegative(),
      levelCount: z.number().int().nonnegative(),
    })
    .optional(),
})

export type GraphComponent = z.infer<typeof GraphComponentSchema>

function graphBounds(graph: PortableGraph) {
  const points: Array<[number, number]> = []
  let levelCount = 0
  for (const node of Object.values(graph.nodes)) {
    if (node.type === 'level') levelCount += 1
    for (const key of ['start', 'end', 'anchor', 'position']) {
      const value = node[key]
      if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
        points.push([
          value[0],
          key === 'position' && typeof value[2] === 'number' ? value[2] : value[1],
        ])
      }
    }
  }
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return {
    width: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    height: levelCount * 3,
    depth: zs.length ? Math.max(...zs) - Math.min(...zs) : 0,
    nodeCount: Object.keys(graph.nodes).length,
    levelCount,
  }
}

export function createGraphComponent(input: {
  name: string
  graph: PortableGraph
  source: GraphComponent['source']
}): GraphComponent {
  const now = new Date().toISOString()
  const rootTypes = input.graph.rootNodeIds.map((id) => input.graph.nodes[id]?.type)
  const kind =
    rootTypes.length === 1 && rootTypes[0] === 'building'
      ? 'building'
      : rootTypes.length === 1 && rootTypes[0] === 'level'
        ? 'level'
        : 'selection'
  return GraphComponentSchema.parse({
    object: 'graph-component',
    schemaVersion: GRAPH_COMPONENT_SCHEMA_VERSION,
    id: `graph_component_${crypto.randomUUID().replaceAll('-', '')}`,
    name: input.name,
    version: 1,
    kind,
    graph: JSON.parse(JSON.stringify(input.graph)),
    source: input.source,
    createdAt: now,
    updatedAt: now,
    preview: graphBounds(input.graph),
  })
}
