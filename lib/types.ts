export type CadPoint = { x: number; y: number; z?: number }

export type CadEntity = {
  type: string
  layer?: string
  name?: string
  text?: string
  startPoint?: CadPoint
  endPoint?: CadPoint
  insertionPoint?: CadPoint
  center?: CadPoint
  radius?: number
  rotation?: number
  measurement?: number
  definitionPoint?: CadPoint
  subDefinitionPoint1?: CadPoint
  subDefinitionPoint2?: CadPoint
  flag?: number
  vertices?: Array<CadPoint & { bulge?: number }>
}

export type CadDocument = {
  entities: CadEntity[]
  header?: Record<string, unknown>
}

export type LevelCandidate = {
  id: string
  name: string
  anchor: CadPoint | null
  selected: boolean
  confidence: 'high' | 'medium' | 'low'
}

export type ImportCategory =
  | 'walls'
  | 'openings'
  | 'dimensions'
  | 'zones'
  | 'annotations'
  | 'furniture'

export type ImportCounts = Record<ImportCategory, number>

export type CadAnalysis = {
  levels: LevelCandidate[]
  counts: ImportCounts
  layers: string[]
  sourceUnit: 'mm' | 'cm' | 'm' | 'ft'
  sourceUnitReason: string
  warnings: string[]
}

export type ImportOptions = {
  importId?: string
  levels: LevelCandidate[]
  categories: Record<ImportCategory, boolean>
  metersPerUnit: number
  wallHeight: number
  wallThickness: number
}

export type PortableGraph = {
  nodes: Record<string, Record<string, unknown>>
  rootNodeIds: string[]
  collections?: Record<string, unknown>
  materials?: Record<string, unknown>
}
