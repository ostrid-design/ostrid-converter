import type {
  CadAnalysis,
  CadDocument,
  CadEntity,
  CadPoint,
  ImportCounts,
  ImportOptions,
  LevelCandidate,
  PortableGraph,
} from './types'

const FLOOR_TITLE =
  /\b(first|second|third|fourth|ground|basement|mezzanine|roof|covered)\s+floor\b|\bfloor\s+(covered|roof|[1-9])\b|\b(planta|piso|nivel)\s+(baja|[1-9]|primera|segunda|tercera)\b/i
const WALL_LAYER = /wall|muro|muros|ladrillo|partition|tabique/i
const OPENING_LAYER = /door|window|puerta|ventana|opening|carpinter/i
const ZONE_LAYER = /zone|room|space|area|piso|floor/i
const ANNOTATION_LAYER = /text|texto|tex\b|title|titulo|anota|label/i
const FURNITURE_LAYER = /furn|muebl|amobla|mobili|movili|fixture|equip/i

export const defaultCategories = {
  walls: true,
  openings: true,
  dimensions: true,
  zones: true,
  annotations: true,
  furniture: false,
} as const

const emptyCounts = (): ImportCounts => ({
  walls: 0,
  openings: 0,
  dimensions: 0,
  zones: 0,
  annotations: 0,
  furniture: 0,
})

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function compactPoint(value: unknown): CadPoint | undefined {
  if (!value || typeof value !== 'object') return undefined
  const point = value as Record<string, unknown>
  const x = finiteNumber(point.x)
  const y = finiteNumber(point.y)
  if (x === undefined || y === undefined) return undefined
  const z = finiteNumber(point.z)
  return z === undefined ? { x, y } : { x, y, z }
}

function compactEntity(value: unknown): CadEntity | null {
  if (!value || typeof value !== 'object') return null
  const entity = value as Record<string, unknown>
  if (typeof entity.type !== 'string') return null
  const vertices = Array.isArray(entity.vertices)
    ? entity.vertices.flatMap((vertex) => {
        const point = compactPoint(vertex)
        if (!point) return []
        const bulge = finiteNumber((vertex as Record<string, unknown>).bulge)
        return [{ ...point, ...(bulge === undefined ? {} : { bulge }) }]
      })
    : undefined
  return {
    type: entity.type,
    layer: typeof entity.layer === 'string' ? entity.layer : undefined,
    name: typeof entity.name === 'string' ? entity.name : undefined,
    text: typeof entity.text === 'string' ? entity.text : undefined,
    startPoint: compactPoint(entity.startPoint),
    endPoint: compactPoint(entity.endPoint),
    insertionPoint: compactPoint(entity.insertionPoint),
    center: compactPoint(entity.center),
    radius: finiteNumber(entity.radius),
    rotation: finiteNumber(entity.rotation),
    measurement: finiteNumber(entity.measurement),
    definitionPoint: compactPoint(entity.definitionPoint),
    subDefinitionPoint1: compactPoint(entity.subDefinitionPoint1),
    subDefinitionPoint2: compactPoint(entity.subDefinitionPoint2),
    flag: finiteNumber(entity.flag),
    vertices,
  }
}

export function compactCadDocument(raw: unknown): CadDocument {
  const document = raw as { entities?: unknown[]; header?: Record<string, unknown> }
  const header = document.header
    ? {
        INSUNITS: document.header.INSUNITS,
        EXTMIN: compactPoint(document.header.EXTMIN),
        EXTMAX: compactPoint(document.header.EXTMAX),
      }
    : undefined
  return {
    header,
    entities: (document.entities ?? []).flatMap((value) => {
      const entity = compactEntity(value)
      if (!entity) return []
      const layer = entity.layer ?? ''
      const hasSegments = entitySegments(entity).length > 0
      const relevant =
        entity.type === 'TEXT' ||
        entity.type === 'MTEXT' ||
        entity.type === 'DIMENSION' ||
        (WALL_LAYER.test(layer) && hasSegments) ||
        (OPENING_LAYER.test(layer) &&
          (hasSegments || entity.type === 'ARC' || entity.type === 'INSERT')) ||
        (ZONE_LAYER.test(layer) &&
          Boolean(entity.vertices?.length) &&
          Boolean((entity.flag ?? 0) & 1)) ||
        (FURNITURE_LAYER.test(layer) && entity.type === 'INSERT')
      return relevant ? [entity] : []
    }),
  }
}

export function entitySegments(entity: CadEntity): Array<[CadPoint, CadPoint]> {
  if (entity.type === 'LINE' && entity.startPoint && entity.endPoint) {
    return [[entity.startPoint, entity.endPoint]]
  }
  if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE2D') && entity.vertices) {
    const segments: Array<[CadPoint, CadPoint]> = []
    for (let index = 1; index < entity.vertices.length; index += 1) {
      const start = entity.vertices[index - 1]
      const end = entity.vertices[index]
      if (start && end) segments.push([start, end])
    }
    if ((entity.flag ?? 0) & 1 && entity.vertices.length > 2) {
      const start = entity.vertices.at(-1)
      const end = entity.vertices[0]
      if (start && end) segments.push([start, end])
    }
    return segments
  }
  return []
}

function cleanText(value: string) {
  return value
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[A-Za-z]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pointOfText(entity: CadEntity) {
  return entity.startPoint ?? entity.insertionPoint ?? null
}

function entityPoint(entity: CadEntity): CadPoint | null {
  if (entity.type === 'DIMENSION' && entity.definitionPoint) return entity.definitionPoint
  if (entity.startPoint && entity.endPoint) {
    return {
      x: (entity.startPoint.x + entity.endPoint.x) / 2,
      y: (entity.startPoint.y + entity.endPoint.y) / 2,
    }
  }
  return entity.insertionPoint ?? entity.center ?? entity.startPoint ?? null
}

function normalizeFloorName(value: string) {
  return cleanText(value)
    .replace(/\b(first|second|third|fourth|ground|basement)\s+floor\s+floor\b/i, '$1 Floor')
    .replace(/\bfloor\s+covered\b/i, 'Covered Floor')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function titlePriority(value: string) {
  const clean = cleanText(value)
  if (/^(first|second|third|fourth|ground|basement) floor( floor)?$/i.test(clean)) return 4
  if (/^(mezzanine|roof|covered) floor$|^floor covered$/i.test(clean)) return 4
  if (/^floor [1-9]$/i.test(clean)) return 3
  if (/area|plate|beam|finish|ceramic|wood|earth/i.test(clean)) return 0
  return 2
}

function inferLevels(entities: CadEntity[]): LevelCandidate[] {
  const candidates = entities
    .flatMap((entity) => {
      const text = entity.text
      if ((entity.type !== 'TEXT' && entity.type !== 'MTEXT') || !text) return []
      if (!FLOOR_TITLE.test(cleanText(text))) return []
      return [
        {
          name: normalizeFloorName(text),
          anchor: pointOfText(entity),
          priority: titlePriority(text),
        },
      ]
    })
    .filter((candidate) => candidate.priority > 0 && candidate.anchor)
    .sort((a, b) => b.priority - a.priority)
  const unique: typeof candidates = []
  for (const candidate of candidates) {
    if (!unique.some((other) => other.name === candidate.name)) unique.push(candidate)
  }
  const exact = unique.filter((candidate) => candidate.priority >= 4)
  const strong = (exact.length >= 2 ? exact : unique.filter((candidate) => candidate.priority >= 3))
    .slice(0, 16)
    .sort(
      (a, b) => (a.anchor?.x ?? 0) - (b.anchor?.x ?? 0) || (a.anchor?.y ?? 0) - (b.anchor?.y ?? 0),
    )
  if (!strong.length) {
    return [
      {
        id: 'level-candidate-1',
        name: 'Ground Floor',
        anchor: null,
        selected: true,
        confidence: 'low',
      },
    ]
  }
  return strong.map((candidate, index) => ({
    id: `level-candidate-${index + 1}`,
    name: candidate.name,
    anchor: candidate.anchor,
    selected: true,
    confidence: candidate.priority === 4 ? 'high' : 'medium',
  }))
}

function inferSourceUnit(entities: CadEntity[], header?: Record<string, unknown>) {
  const lengths = entities
    .flatMap(entitySegments)
    .map(([start, end]) => Math.hypot(end.x - start.x, end.y - start.y))
    .filter((value) => value > 0)
    .sort((a, b) => a - b)
  const median = lengths[Math.floor(lengths.length / 2)] ?? 1
  if (header?.INSUNITS === 2)
    return { sourceUnit: 'ft' as const, reason: 'The CAD header declares feet.' }
  if (median > 100)
    return { sourceUnit: 'mm' as const, reason: 'Typical CAD segments are hundreds of units long.' }
  if (median > 20)
    return {
      sourceUnit: 'cm' as const,
      reason: 'Typical CAD segments suggest centimetre drafting.',
    }
  return {
    sourceUnit: 'm' as const,
    reason: 'Geometry proportions are consistent with metre-based drafting.',
  }
}

export function analyzeCadDocument(document: CadDocument): CadAnalysis {
  const counts = emptyCounts()
  const layers = new Set<string>()
  for (const entity of document.entities) {
    const layer = entity.layer ?? '0'
    layers.add(layer)
    if (WALL_LAYER.test(layer)) counts.walls += entitySegments(entity).length
    if (OPENING_LAYER.test(layer) && (entity.type === 'ARC' || entity.type === 'INSERT'))
      counts.openings += 1
    if (entity.type === 'DIMENSION') counts.dimensions += 1
    if (ZONE_LAYER.test(layer) && entity.vertices && (entity.flag ?? 0) & 1) counts.zones += 1
    if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && entity.text) counts.annotations += 1
    if (FURNITURE_LAYER.test(layer) && entity.type === 'INSERT') counts.furniture += 1
  }
  const unit = inferSourceUnit(document.entities, document.header)
  const levels = inferLevels(document.entities)
  const warnings: string[] = []
  if (levels.some((level) => level.confidence === 'low'))
    warnings.push('No unambiguous floor title was found; one level is proposed for review.')
  if (!counts.walls)
    warnings.push(
      'No wall-named layer was found. Review the preview and layer naming before export.',
    )
  return {
    levels,
    counts,
    layers: [...layers].sort(),
    sourceUnit: unit.sourceUnit,
    sourceUnitReason: unit.reason,
    warnings,
  }
}

function boundsOf(entities: CadEntity[]) {
  const points = entities.flatMap((entity) => {
    const segmentPoints = entitySegments(entity).flat()
    const point = entityPoint(entity)
    return point ? [...segmentPoints, point] : segmentPoints
  })
  if (!points.length) return { centerX: 0, centerY: 0, width: 30, height: 30 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
}

function entitiesForLevel(entities: CadEntity[], level: LevelCandidate, levels: LevelCandidate[]) {
  if (!level.anchor || levels.length === 1) return entities
  const levelAnchor = level.anchor
  const anchors = levels.filter((candidate) => candidate.anchor)
  const gaps = anchors
    .slice(1)
    .map((candidate, index) => {
      const previous = anchors[index]
      return candidate.anchor && previous?.anchor
        ? Math.abs(candidate.anchor.x - previous.anchor.x)
        : 0
    })
    .filter(Boolean)
    .sort((a, b) => a - b)
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 20
  return entities.filter((entity) => {
    const point = entityPoint(entity)
    if (!point) return false
    const nearest = anchors.reduce(
      (best, candidate) => {
        const distance = candidate.anchor
          ? Math.abs(point.x - candidate.anchor.x)
          : Number.POSITIVE_INFINITY
        return distance < best.distance ? { id: candidate.id, distance } : best
      },
      { id: '', distance: Number.POSITIVE_INFINITY },
    )
    return (
      nearest.id === level.id &&
      nearest.distance <= Math.max(6, medianGap * 0.8) &&
      Math.abs(point.y - levelAnchor.y) <= Math.max(35, medianGap * 3.2)
    )
  })
}

function nearestWall(
  point: CadPoint,
  walls: Array<{ id: string; start: [number, number]; end: [number, number] }>,
) {
  let result: { wall: (typeof walls)[number]; along: number; distance: number } | null = null
  for (const wall of walls) {
    const dx = wall.end[0] - wall.start[0]
    const dy = wall.end[1] - wall.start[1]
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) continue
    const along = Math.max(
      0,
      Math.min(
        1,
        ((point.x - wall.start[0]) * dx + (point.y - wall.start[1]) * dy) / lengthSquared,
      ),
    )
    const distance = Math.hypot(
      point.x - (wall.start[0] + along * dx),
      point.y - (wall.start[1] + along * dy),
    )
    if (!result || distance < result.distance) result = { wall, along, distance }
  }
  return result
}

export type BuiltGraph = { graph: PortableGraph; counts: ImportCounts }

export function buildGraph(document: CadDocument, options: ImportOptions): BuiltGraph {
  const nodes: Record<string, Record<string, unknown>> = {}
  const counts = emptyCounts()
  const stamp =
    options.importId?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) ||
    crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  const buildingId = `building_import-${stamp}`
  const levels = options.levels.filter((level) => level.selected)
  const levelIds: string[] = []
  levels.forEach((level, levelIndex) => {
    const levelId = `level_import-${stamp}-${levelIndex}`
    levelIds.push(levelId)
    const source = entitiesForLevel(document.entities, level, levels)
    const bounds = boundsOf(source)
    const toPlan = (point: CadPoint): [number, number] => [
      (point.x - bounds.centerX) * options.metersPerUnit,
      -(point.y - bounds.centerY) * options.metersPerUnit,
    ]
    const children: string[] = []
    const walls: Array<{ id: string; start: [number, number]; end: [number, number] }> = []
    if (options.categories.walls) {
      const seen = new Set<string>()
      for (const entity of source.filter((candidate) => WALL_LAYER.test(candidate.layer ?? ''))) {
        for (const [rawStart, rawEnd] of entitySegments(entity)) {
          const start = toPlan(rawStart)
          const end = toPlan(rawEnd)
          if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.08) continue
          const key = [start, end]
            .map((point) => `${point[0].toFixed(3)},${point[1].toFixed(3)}`)
            .sort()
            .join('|')
          if (seen.has(key) || walls.length >= 2500) continue
          seen.add(key)
          const id = `wall_import-${stamp}-${levelIndex}-${walls.length}`
          walls.push({ id, start, end })
          nodes[id] = {
            object: 'node',
            id,
            type: 'wall',
            name: `Imported wall ${walls.length}`,
            parentId: levelId,
            visible: true,
            metadata: { importLayer: entity.layer },
            children: [],
            start,
            end,
            thickness: options.wallThickness,
            height: options.wallHeight,
            frontSide: 'unknown',
            backSide: 'unknown',
          }
          children.push(id)
          counts.walls += 1
        }
      }
    }
    if (options.categories.openings && walls.length) {
      const seen = new Set<string>()
      for (const entity of source.filter(
        (candidate) =>
          OPENING_LAYER.test(candidate.layer ?? '') &&
          (candidate.type === 'ARC' || candidate.type === 'INSERT'),
      )) {
        const rawPoint = entity.center ?? entity.insertionPoint
        if (!rawPoint) continue
        const plan = toPlan(rawPoint)
        const nearest = nearestWall({ x: plan[0], y: plan[1] }, walls)
        if (!nearest || nearest.distance > 0.75) continue
        const key = `${nearest.wall.id}:${nearest.along.toFixed(2)}`
        if (seen.has(key)) continue
        seen.add(key)
        const isWindow = /window|ventana/i.test(`${entity.layer ?? ''} ${entity.name ?? ''}`)
        const id = `${isWindow ? 'window' : 'door'}_import-${stamp}-${levelIndex}-${seen.size}`
        const wallLength = Math.hypot(
          nearest.wall.end[0] - nearest.wall.start[0],
          nearest.wall.end[1] - nearest.wall.start[1],
        )
        nodes[id] = {
          object: 'node',
          id,
          type: isWindow ? 'window' : 'door',
          name: `Imported ${isWindow ? 'window' : 'door'}`,
          parentId: nearest.wall.id,
          visible: true,
          metadata: { importLayer: entity.layer },
          wallId: nearest.wall.id,
          position: [(nearest.along - 0.5) * wallLength, isWindow ? 1.65 : 1.05, 0],
          rotation: [0, 0, 0],
          width: Math.max(
            0.6,
            Math.min(2.4, (entity.radius ?? 0.9 / options.metersPerUnit) * options.metersPerUnit),
          ),
          height: isWindow ? 1.2 : 2.1,
          ...(isWindow
            ? { openingKind: 'window', windowType: 'fixed' }
            : { doorCategory: 'interior', doorType: 'hinged' }),
        }
        const wallNode = nodes[nearest.wall.id]
        if (wallNode) (wallNode.children as string[]).push(id)
        counts.openings += 1
      }
    }
    if (options.categories.dimensions) {
      for (const entity of source
        .filter((candidate) => candidate.type === 'DIMENSION')
        .slice(0, 300)) {
        if (!(entity.subDefinitionPoint1 && entity.subDefinitionPoint2)) continue
        const id = `dimension_import-${stamp}-${levelIndex}-${counts.dimensions}`
        const start = toPlan(entity.subDefinitionPoint1)
        const end = toPlan(entity.subDefinitionPoint2)
        nodes[id] = {
          object: 'node',
          id,
          type: 'dimension',
          name: 'Imported dimension',
          parentId: levelId,
          visible: true,
          metadata: { importLayer: entity.layer },
          start,
          end,
          offset: [0, -0.8],
          label: entity.text && entity.text !== '<>' ? cleanText(entity.text) : undefined,
        }
        children.push(id)
        counts.dimensions += 1
      }
    }
    if (options.categories.zones) {
      for (const entity of source
        .filter(
          (candidate) =>
            ZONE_LAYER.test(candidate.layer ?? '') &&
            candidate.vertices &&
            (candidate.flag ?? 0) & 1,
        )
        .slice(0, 100)) {
        const polygon = (entity.vertices ?? []).map(toPlan)
        if (polygon.length < 3) continue
        const id = `zone_import-${stamp}-${levelIndex}-${counts.zones}`
        nodes[id] = {
          object: 'node',
          id,
          type: 'zone',
          name: `Imported zone ${counts.zones + 1}`,
          parentId: levelId,
          visible: true,
          metadata: { importLayer: entity.layer },
          polygon,
          color: '#6456f6',
        }
        children.push(id)
        counts.zones += 1
      }
    }
    if (options.categories.annotations) {
      for (const entity of source
        .filter(
          (candidate) =>
            (candidate.type === 'TEXT' || candidate.type === 'MTEXT') &&
            candidate.text &&
            ANNOTATION_LAYER.test(candidate.layer ?? ''),
        )
        .slice(0, 250)) {
        const point = pointOfText(entity)
        const text = cleanText(entity.text ?? '')
        if (!point || !text || FLOOR_TITLE.test(text)) continue
        const id = `annotation_import-${stamp}-${levelIndex}-${counts.annotations}`
        const anchor = toPlan(point)
        nodes[id] = {
          object: 'node',
          id,
          type: 'annotation',
          name: text.slice(0, 60),
          parentId: levelId,
          visible: true,
          metadata: { importLayer: entity.layer },
          text,
          anchor,
          elbow: [anchor[0] + 0.5, anchor[1] - 0.35],
          textPosition: [anchor[0] + 0.8, anchor[1] - 0.35],
          fontSize: 0.18,
        }
        children.push(id)
        counts.annotations += 1
      }
    }
    nodes[levelId] = {
      object: 'node',
      id: levelId,
      type: 'level',
      name: level.name,
      parentId: buildingId,
      visible: true,
      metadata: { imported: true, sourceAnchor: level.anchor, sourceLevelId: level.id },
      level: levelIndex,
      elevation: levelIndex * options.wallHeight,
      children,
    }
  })
  nodes[buildingId] = {
    object: 'node',
    id: buildingId,
    type: 'building',
    name: 'Imported building',
    parentId: null,
    visible: true,
    metadata: { imported: true },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: levelIds,
  }
  return { graph: { nodes, rootNodeIds: [buildingId] }, counts }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function createCadPreviewSvg(document: CadDocument) {
  const drawable = document.entities.filter(
    (entity) =>
      WALL_LAYER.test(entity.layer ?? '') ||
      OPENING_LAYER.test(entity.layer ?? '') ||
      ZONE_LAYER.test(entity.layer ?? '') ||
      entity.type === 'DIMENSION' ||
      ((entity.type === 'TEXT' || entity.type === 'MTEXT') && FLOOR_TITLE.test(entity.text ?? '')),
  )
  const bounds = boundsOf(drawable)
  const padding = Math.max(bounds.width, bounds.height) * 0.03
  const minX = bounds.centerX - bounds.width / 2 - padding
  const minY = -(bounds.centerY + bounds.height / 2 + padding)
  const width = bounds.width + padding * 2
  const height = bounds.height + padding * 2
  const body: string[] = []
  for (const entity of drawable.slice(0, 15_000)) {
    const color = OPENING_LAYER.test(entity.layer ?? '')
      ? '#1fc9c0'
      : entity.type === 'DIMENSION'
        ? '#6456f6'
        : '#0f0f0f'
    for (const [start, end] of entitySegments(entity))
      body.push(
        `<line x1="${start.x}" y1="${-start.y}" x2="${end.x}" y2="${-end.y}" stroke="${color}" stroke-width="${Math.max(width / 1800, 0.015)}"/>`,
      )
    if (entity.type === 'ARC' && entity.center && entity.radius)
      body.push(
        `<circle cx="${entity.center.x}" cy="${-entity.center.y}" r="${entity.radius}" fill="none" stroke="${color}" stroke-width="${Math.max(width / 1800, 0.015)}"/>`,
      )
    if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && entity.text) {
      const point = pointOfText(entity)
      if (point)
        body.push(
          `<text x="${point.x}" y="${-point.y}" fill="#0f0f0f" font-size="${Math.max(width / 180, 0.16)}" font-family="sans-serif">${escapeXml(cleanText(entity.text))}</text>`,
        )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" preserveAspectRatio="xMidYMid meet"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f8fafc"/>${body.join('')}</svg>`
}

export function metersPerUnitFor(unit: CadAnalysis['sourceUnit']) {
  if (unit === 'mm') return 0.001
  if (unit === 'cm') return 0.01
  if (unit === 'ft') return 0.3048
  return 1
}
