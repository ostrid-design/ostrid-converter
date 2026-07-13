import * as WebIFC from 'web-ifc'
import type { PortableGraph } from './types'

export const EMBEDDED_IFC_MODEL_URL = 'asset://embedded/ifc-model.glb'

export type IfcMeshPrimitive = {
  expressId: number
  geometryExpressId: number
  ifcType: string
  name: string
  storeyExpressId?: number
  color: [number, number, number, number]
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
}

export type IfcMeshModel = {
  primitives: IfcMeshPrimitive[]
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  elementCount: number
  triangleCount: number
  unitFactor: number
}

function getLengthUnitFactor(ifcApi: WebIFC.IfcAPI, modelId: number) {
  try {
    const projects = ifcApi.GetLineIDsWithType(modelId, WebIFC.IFCPROJECT)
    if (!projects.size()) return 1
    const project = ifcApi.GetLine(modelId, projects.get(0))
    const assignment = ifcApi.GetLine(modelId, project.UnitsInContext.value)
    for (const unitRef of assignment.Units ?? []) {
      const unit = ifcApi.GetLine(modelId, unitRef.value)
      if (unit.UnitType?.value !== 'LENGTHUNIT') continue
      const prefix = unit.Prefix?.value
      if (prefix === 'MILLI') return 0.001
      if (prefix === 'CENTI') return 0.01
      if (prefix === 'DECI') return 0.1
      if (prefix === 'KILO') return 1000
      return 1
    }
  } catch {
    // IFC geometry defaults to metres when no explicit length unit is available.
  }
  return 1
}

function transformPoint(matrix: ArrayLike<number>, x: number, y: number, z: number) {
  const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]
  const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]
  const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  return [worldX, worldZ, worldY] as const
}

function transformNormal(matrix: ArrayLike<number>, x: number, y: number, z: number) {
  const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z
  const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z
  const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z
  const length = Math.hypot(worldX, worldY, worldZ) || 1
  return [worldX / length, worldZ / length, worldY / length] as const
}

/**
 * Preserve the tessellated geometry web-ifc produces for every renderable IFC
 * product. This is deliberately separate from semantic/native-node inference:
 * faithful geometry is the fallback when an IFC author used unusual entity
 * classes, BReps, mapped items, or product types Ostrid does not model yet.
 */
export async function extractIfcMeshModel(
  data: Uint8Array,
  options: {
    wasmPath?: string
    onProgress?: (message: string, percent: number) => void
  } = {},
): Promise<IfcMeshModel> {
  const api = new WebIFC.IfcAPI()
  api.SetWasmPath(options.wasmPath ?? '/', true)
  options.onProgress?.('Initializing faithful IFC geometry…', 4)
  await api.Init()
  const modelId = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true })
  const unitFactor = getLengthUnitFactor(api, modelId)
  const spatialParent = new Map<number, number>()
  const storeyIds = new Set<number>()
  const storeys = api.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY)
  for (let index = 0; index < storeys.size(); index += 1) storeyIds.add(storeys.get(index))
  for (const relationType of [WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, WebIFC.IFCRELAGGREGATES]) {
    const relations = api.GetLineIDsWithType(modelId, relationType)
    for (let index = 0; index < relations.size(); index += 1) {
      try {
        const relation = api.GetLine(modelId, relations.get(index))
        const parent =
          relation.RelatingStructure?.value ?? relation.RelatingObject?.value ?? undefined
        const children = relation.RelatedElements ?? relation.RelatedObjects ?? []
        if (typeof parent !== 'number') continue
        for (const child of children) {
          if (typeof child?.value === 'number') spatialParent.set(child.value, parent)
        }
      } catch {
        // Ignore malformed relationship rows and keep the geometry.
      }
    }
  }
  const storeyFor = (expressId: number) => {
    let current: number | undefined = expressId
    const seen = new Set<number>()
    while (current !== undefined && !seen.has(current)) {
      if (storeyIds.has(current)) return current
      seen.add(current)
      current = spatialParent.get(current)
    }
    return undefined
  }
  const primitives: IfcMeshPrimitive[] = []
  const expressIds = new Set<number>()
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let triangleCount = 0

  try {
    api.StreamAllMeshes(modelId, (flatMesh, index, total) => {
      expressIds.add(flatMesh.expressID)
      let line: Record<string, { value?: unknown }> | null = null
      try {
        line = api.GetLine(modelId, flatMesh.expressID) as Record<string, { value?: unknown }>
      } catch {
        // Geometry is still useful even when the STEP line is unavailable.
      }
      let ifcType = 'IFCPRODUCT'
      try {
        ifcType = api.GetNameFromTypeCode(api.GetLineType(modelId, flatMesh.expressID))
      } catch {
        // Keep the generic product label.
      }
      const nameValue = line?.Name?.value
      const name = typeof nameValue === 'string' && nameValue.trim() ? nameValue : ifcType

      for (let placedIndex = 0; placedIndex < flatMesh.geometries.size(); placedIndex += 1) {
        const placed = flatMesh.geometries.get(placedIndex)
        const geometry = api.GetGeometry(modelId, placed.geometryExpressID)
        try {
          const vertexData = api.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize(),
          )
          const sourceIndices = api.GetIndexArray(
            geometry.GetIndexData(),
            geometry.GetIndexDataSize(),
          )
          const vertexCount = Math.floor(vertexData.length / 6)
          if (!vertexCount || sourceIndices.length < 3) continue
          const positions = new Float32Array(vertexCount * 3)
          const normals = new Float32Array(vertexCount * 3)
          for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
            const sourceOffset = vertexIndex * 6
            const targetOffset = vertexIndex * 3
            const point = transformPoint(
              placed.flatTransformation,
              vertexData[sourceOffset],
              vertexData[sourceOffset + 1],
              vertexData[sourceOffset + 2],
            )
            const normal = transformNormal(
              placed.flatTransformation,
              vertexData[sourceOffset + 3],
              vertexData[sourceOffset + 4],
              vertexData[sourceOffset + 5],
            )
            for (let axis = 0; axis < 3; axis += 1) {
              // web-ifc's geometry API already normalizes project length
              // units to metres (including placement translations).
              const value = point[axis]
              positions[targetOffset + axis] = value
              normals[targetOffset + axis] = normal[axis]
              min[axis] = Math.min(min[axis], value)
              max[axis] = Math.max(max[axis], value)
            }
          }
          // Swapping IFC Y/Z changes handedness, so reverse each triangle to
          // preserve outward-facing surfaces and correct lighting.
          const indices = new Uint32Array(sourceIndices.length)
          for (let offset = 0; offset < sourceIndices.length; offset += 3) {
            indices[offset] = sourceIndices[offset]
            indices[offset + 1] = sourceIndices[offset + 2]
            indices[offset + 2] = sourceIndices[offset + 1]
          }
          triangleCount += Math.floor(indices.length / 3)
          primitives.push({
            expressId: flatMesh.expressID,
            geometryExpressId: placed.geometryExpressID,
            ifcType,
            name,
            storeyExpressId: storeyFor(flatMesh.expressID),
            color: [placed.color.x, placed.color.y, placed.color.z, placed.color.w],
            positions,
            normals,
            indices,
          })
        } finally {
          geometry.delete()
        }
      }
      ;(flatMesh as WebIFC.FlatMesh & { delete?: () => void }).delete?.()
      options.onProgress?.(
        `Preserving IFC product geometry ${Math.min(index + 1, total)} of ${total}…`,
        5 + Math.round(((index + 1) / Math.max(total, 1)) * 40),
      )
    })
  } finally {
    api.CloseModel(modelId)
    api.Dispose()
  }

  if (!primitives.length) throw new Error('The IFC parser found no renderable product geometry.')
  return {
    primitives,
    bounds: { min, max },
    elementCount: expressIds.size,
    triangleCount,
    unitFactor,
  }
}

export function filterIfcMeshModel(
  model: IfcMeshModel,
  selectedStoreyExpressIds: Set<number>,
  excludedProductExpressIds: Set<number> = new Set(),
): IfcMeshModel {
  const primitives = model.primitives.filter(
    (primitive) =>
      !excludedProductExpressIds.has(primitive.expressId) &&
      (!selectedStoreyExpressIds.size ||
        primitive.storeyExpressId === undefined ||
        selectedStoreyExpressIds.has(primitive.storeyExpressId)),
  )
  if (primitives.length === model.primitives.length) return model
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const expressIds = new Set<number>()
  let triangleCount = 0
  for (const primitive of primitives) {
    expressIds.add(primitive.expressId)
    triangleCount += Math.floor(primitive.indices.length / 3)
    for (let offset = 0; offset < primitive.positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], primitive.positions[offset + axis])
        max[axis] = Math.max(max[axis], primitive.positions[offset + axis])
      }
    }
  }
  if (!primitives.length) {
    min.fill(0)
    max.fill(0)
  }
  return {
    ...model,
    primitives,
    bounds: { min, max },
    elementCount: expressIds.size,
    triangleCount,
  }
}

export function createIfcFallbackGraph(model: IfcMeshModel): PortableGraph {
  const stamp = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  const buildingId = `building_ifc-${stamp}`
  const storeyExpressIds = [
    ...new Set(
      model.primitives.flatMap((primitive) =>
        primitive.storeyExpressId === undefined ? [] : [primitive.storeyExpressId],
      ),
    ),
  ].sort((a, b) => a - b)
  const storeys = storeyExpressIds.length ? storeyExpressIds : [undefined]
  const levelIds = storeys.map((expressId) =>
    expressId === undefined ? `level_ifc-${stamp}-0` : `level_ifc-${stamp}-${expressId}`,
  )
  const nodes: PortableGraph['nodes'] = {
    [buildingId]: {
      object: 'node',
      id: buildingId,
      type: 'building',
      name: 'Imported IFC building',
      parentId: null,
      visible: true,
      metadata: { imported: true, geometryOnlyFallback: true },
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      children: levelIds,
    },
  }
  levelIds.forEach((id, index) => {
    const expressId = storeys[index]
    nodes[id] = {
      object: 'node',
      id,
      type: 'level',
      name: expressId === undefined ? 'Ground Floor' : `IFC Storey #${expressId}`,
      parentId: buildingId,
      visible: true,
      metadata: {
        imported: true,
        geometryOnlyFallback: true,
        ...(expressId === undefined ? {} : { expressID: expressId }),
      },
      level: index,
      elevation: index * 3,
      children: [],
    }
  })
  return { nodes, rootNodeIds: [buildingId] }
}

export function addIfcReferenceNode(graph: PortableGraph, model: IfcMeshModel): PortableGraph {
  const nodes = structuredClone(graph.nodes)
  const building = Object.values(nodes).find((node) => node.type === 'building')
  if (!building || typeof building.id !== 'string') return graph
  const scanId = `scan_ifc-${crypto.randomUUID().replaceAll('-', '')}`
  nodes[scanId] = {
    object: 'node',
    id: scanId,
    type: 'scan',
    name: 'Faithful IFC geometry',
    parentId: building.id,
    visible: true,
    metadata: {
      imported: true,
      sourceFormat: 'ifc',
      preservedElements: model.elementCount,
      triangles: model.triangleCount,
    },
    url: EMBEDDED_IFC_MODEL_URL,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    opacity: 100,
  }
  building.children = Array.isArray(building.children) ? [...building.children, scanId] : [scanId]
  return { ...graph, nodes }
}
