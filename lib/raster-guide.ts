import type { PortableGraph } from './types'

export const EMBEDDED_RASTER_PREFIX = 'asset://embedded/'

export type RasterGuideImage = {
  levelCandidateId: string
  fileName: string
  width: number
  height: number
  dataUrl: string
}

export function addRasterGuideNodes(
  graph: PortableGraph,
  images: RasterGuideImage[],
  metersPerUnit: number,
): PortableGraph {
  if (!images.length) return graph
  const nodes = structuredClone(graph.nodes)
  const levelBySourceId = new Map<string, Record<string, unknown>>()
  for (const node of Object.values(nodes)) {
    if (node.type !== 'level') continue
    const metadata = node.metadata as Record<string, unknown> | undefined
    if (typeof metadata?.sourceLevelId === 'string')
      levelBySourceId.set(metadata.sourceLevelId, node)
  }
  images.forEach((image, index) => {
    const level = levelBySourceId.get(image.levelCandidateId)
    if (!level || typeof level.id !== 'string') return
    const id = `guide_import-${image.levelCandidateId.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`
    nodes[id] = {
      object: 'node',
      id,
      type: 'guide',
      name: image.fileName.replace(/\.[^.]+$/, ''),
      parentId: level.id,
      visible: true,
      metadata: { imported: true, sourceFormat: 'raster' },
      children: [],
      url: `${EMBEDDED_RASTER_PREFIX}${image.fileName}`,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: Math.max(0.001, (image.width * metersPerUnit) / 10),
      opacity: 45,
      scaleReference: null,
    }
    level.children = Array.isArray(level.children) ? [...level.children, id] : [id]
  })
  return { ...graph, nodes }
}
