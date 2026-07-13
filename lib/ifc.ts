import type { BuiltGraph } from './cad'
import type {
  CadAnalysis,
  ImportCategory,
  ImportCounts,
  LevelCandidate,
  PortableGraph,
} from './types'

function childrenOf(node: Record<string, unknown>) {
  return Array.isArray(node.children)
    ? node.children.filter((id): id is string => typeof id === 'string')
    : []
}

function collectDescendants(graph: PortableGraph, roots: string[]) {
  const included = new Set<string>()
  const visit = (id: string) => {
    if (included.has(id) || !graph.nodes[id]) return
    included.add(id)
    childrenOf(graph.nodes[id]).forEach(visit)
  }
  roots.forEach(visit)
  return included
}

export function normalizeIfcGraph(graph: PortableGraph): PortableGraph {
  const buildingRoots = Object.values(graph.nodes)
    .filter((node) => node.type === 'building')
    .map((node) => String(node.id))
  const roots = buildingRoots.length ? buildingRoots : graph.rootNodeIds
  const included = collectDescendants(graph, roots)
  const nodes: PortableGraph['nodes'] = {}
  for (const id of included) {
    const source = graph.nodes[id]
    if (!source) continue
    nodes[id] = {
      ...source,
      parentId: roots.includes(id) ? null : source.parentId,
      children: childrenOf(source).filter((childId) => included.has(childId)),
    }
  }
  return { nodes, rootNodeIds: roots }
}

function countGraph(graph: PortableGraph): ImportCounts {
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

export function analyzeIfcGraph(graph: PortableGraph): CadAnalysis {
  const levels: LevelCandidate[] = Object.values(graph.nodes)
    .filter((node) => node.type === 'level')
    .sort((a, b) => {
      const aMetadata = (a.metadata ?? {}) as Record<string, unknown>
      const bMetadata = (b.metadata ?? {}) as Record<string, unknown>
      return (
        Number(aMetadata.elevation ?? a.level ?? 0) - Number(bMetadata.elevation ?? b.level ?? 0)
      )
    })
    .map((node, index) => ({
      id: String(node.id),
      name: typeof node.name === 'string' ? node.name : `Level ${index + 1}`,
      anchor: null,
      selected: true,
      confidence: 'high',
    }))
  return {
    levels: levels.length
      ? levels
      : [
          {
            id: 'ifc-level-fallback',
            name: 'Ground Floor',
            anchor: null,
            selected: true,
            confidence: 'low',
          },
        ],
    counts: countGraph(graph),
    layers: [],
    sourceUnit: 'm',
    sourceUnitReason: 'IFC project units were normalized to metres by web-ifc.',
    warnings: [
      'IFC walls, openings, slabs, stairs, roofs, and columns are converted when their geometry is available.',
      'IFC beams and catalog-less furnishing geometry are counted by the parser but are not exported as editable Ostrid nodes yet.',
    ],
  }
}

function categoryEnabled(type: unknown, categories: Record<ImportCategory, boolean>) {
  if (type === 'wall') return categories.walls
  if (type === 'door' || type === 'window') return categories.openings
  if (type === 'dimension') return categories.dimensions
  if (type === 'zone') return categories.zones
  if (type === 'annotation') return categories.annotations
  if (type === 'item') return categories.furniture
  return true
}

export function filterIfcGraph(
  source: PortableGraph,
  levels: LevelCandidate[],
  categories: Record<ImportCategory, boolean>,
): BuiltGraph {
  const selectedLevels = new Set(levels.filter((level) => level.selected).map((level) => level.id))
  const levelNames = new Map(levels.map((level) => [level.id, level.name]))
  const nodes: PortableGraph['nodes'] = {}

  const visit = (id: string, activeLevelSelected = true): boolean => {
    const node = source.nodes[id]
    if (!node) return false
    const isLevel = node.type === 'level'
    const selected = isLevel ? selectedLevels.has(id) : activeLevelSelected
    if (!selected || !categoryEnabled(node.type, categories)) return false
    const includedChildren = childrenOf(node).filter((childId) => visit(childId, selected))
    nodes[id] = {
      ...node,
      ...(isLevel && levelNames.has(id) ? { name: levelNames.get(id) } : {}),
      children: includedChildren,
    }
    return true
  }

  const rootNodeIds = source.rootNodeIds.filter((id) => visit(id))
  const included = new Set(Object.keys(nodes))
  for (const node of Object.values(nodes)) {
    if (typeof node.parentId === 'string' && !included.has(node.parentId)) node.parentId = null
  }
  const graph = { nodes, rootNodeIds }
  return { graph, counts: countGraph(graph) }
}

export function createIfcPreviewSvg(graph: PortableGraph) {
  const walls = Object.values(graph.nodes).filter(
    (node) =>
      node.type === 'wall' &&
      Array.isArray(node.start) &&
      Array.isArray(node.end) &&
      typeof node.start[0] === 'number' &&
      typeof node.start[1] === 'number' &&
      typeof node.end[0] === 'number' &&
      typeof node.end[1] === 'number',
  )
  const points = walls.flatMap((wall) => [wall.start as number[], wall.end as number[]])
  if (!points.length) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f8fafc"/><text x="50" y="50" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="5">No wall axes found</text></svg>'
  }
  const xs = points.map((point) => point[0] ?? 0)
  const ys = points.map((point) => point[1] ?? 0)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const padding = Math.max(width, height) * 0.05
  const lines = walls
    .map((wall, index) => {
      const start = wall.start as number[]
      const end = wall.end as number[]
      const colors = ['#f97316', '#0ea5e9', '#8b5cf6', '#10b981']
      return `<line x1="${start[0]}" y1="${-(start[1] ?? 0)}" x2="${end[0]}" y2="${-(end[1] ?? 0)}" stroke="${colors[index % colors.length]}" stroke-width="${Math.max(width / 900, 0.02)}"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${-maxY - padding} ${width + padding * 2} ${height + padding * 2}" preserveAspectRatio="xMidYMid meet"><rect x="${minX - padding}" y="${-maxY - padding}" width="${width + padding * 2}" height="${height + padding * 2}" fill="#f8fafc"/>${lines}</svg>`
}
