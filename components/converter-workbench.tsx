'use client'

import { upload } from '@vercel/blob/client'
import { Box, FileUp, LockKeyhole, RotateCcw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { buildGraph, defaultCategories, metersPerUnitFor } from '../lib/cad'
import { createComponentBundle, exportIfcModelGlb } from '../lib/component-bundle'
import { createGraphComponent } from '../lib/graph-component'
import {
  applyGraphReview,
  countGraphObjects,
  emptyGraphReview,
  type GraphReview,
  removeReviewNode,
} from '../lib/graph-review'
import { analyzeIfcGraph, createIfcPreviewSvg, filterIfcGraph, normalizeIfcGraph } from '../lib/ifc'
import {
  addIfcReferenceNode,
  createIfcFallbackGraph,
  extractIfcMeshModel,
  filterIfcMeshModel,
  type IfcMeshModel,
} from '../lib/ifc-mesh'
import { addRasterGuideNodes, type RasterGuideImage } from '../lib/raster-guide'
import type {
  CadAnalysis,
  CadDocument,
  ImportCategory,
  LevelCandidate,
  PortableGraph,
} from '../lib/types'
import { GraphReviewEditor } from './graph-review-editor'
import { IfcModelPreview, type IfcProductSelection } from './ifc-model-preview'
import { InferredModelPreview } from './inferred-model-preview'
import { PlanPreview } from './plan-preview'

type SourceKind = 'dwg' | 'dxf' | 'ifc' | 'pdf' | 'image'
type Axis = 'x' | 'y' | 'z'
type IfcOrientation = Record<Axis, number>

const DEFAULT_IFC_ORIENTATION: IfcOrientation = { x: 0, y: 0, z: 0 }

type InspectResult = {
  document?: CadDocument
  documentUrl?: string
  analysis: CadAnalysis
  previewSvg: string
  error?: string
}
const categoryLabels: Record<ImportCategory, string> = {
  walls: 'Walls',
  openings: 'Doors & windows',
  dimensions: 'Dimensions',
  zones: 'Zones / rooms',
  annotations: 'Annotations',
  furniture: 'Furniture blocks (mapping required)',
}

function safeBaseName(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9 _-]+/g, '')
      .trim() || 'Imported plan'
  )
}

function sourceKindFor(file: File): SourceKind | null {
  const extension = file.name.toLowerCase().split('.').pop()
  if (extension === 'dwg' || extension === 'dxf' || extension === 'ifc' || extension === 'pdf') {
    return extension
  }
  return file.type.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(extension ?? '')
    ? 'image'
    : null
}

function withBuildingRotation(graph: PortableGraph, orientation: IfcOrientation): PortableGraph {
  if (!orientation.x && !orientation.y && !orientation.z) return graph
  const nodes = structuredClone(graph.nodes)
  for (const node of Object.values(nodes)) {
    if (node.type !== 'building') continue
    node.rotation = [
      (orientation.x * Math.PI) / 180,
      (orientation.y * Math.PI) / 180,
      (orientation.z * Math.PI) / 180,
    ]
  }
  return { ...graph, nodes }
}

export function ConverterWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null)
  const [document, setDocument] = useState<CadDocument | null>(null)
  const [directGraph, setDirectGraph] = useState<PortableGraph | null>(null)
  const [ifcMeshModel, setIfcMeshModel] = useState<IfcMeshModel | null>(null)
  const [includeFaithfulIfc, setIncludeFaithfulIfc] = useState(true)
  const [ifcOrientation, setIfcOrientation] = useState<IfcOrientation>({
    ...DEFAULT_IFC_ORIENTATION,
  })
  const [analysis, setAnalysis] = useState<CadAnalysis | null>(null)
  const [levels, setLevels] = useState<LevelCandidate[]>([])
  const [categories, setCategories] = useState<Record<ImportCategory, boolean>>({
    ...defaultCategories,
  })
  const [metersPerUnit, setMetersPerUnit] = useState(1)
  const [wallHeight, setWallHeight] = useState(2.8)
  const [wallThickness, setWallThickness] = useState(0.18)
  const [componentName, setComponentName] = useState('Imported building')
  const [previewSvg, setPreviewSvg] = useState('')
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationPoints, setCalibrationPoints] = useState<Array<[number, number]>>([])
  const [knownDistance, setKnownDistance] = useState(1)
  const [workingMessage, setWorkingMessage] = useState('Parsing entities and looking for floors…')
  const [importId, setImportId] = useState(() =>
    crypto.randomUUID().replaceAll('-', '').slice(0, 16),
  )
  const [graphReview, setGraphReview] = useState<GraphReview>(() => emptyGraphReview())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [excludedIfcProductIds, setExcludedIfcProductIds] = useState<number[]>([])
  const [ifcProductSelection, setIfcProductSelection] = useState<IfcProductSelection | null>(null)
  const [rasterGuideImages, setRasterGuideImages] = useState<RasterGuideImage[]>([])

  const previewViewBox = useMemo(() => {
    const match = previewSvg.match(/viewBox="([^"]+)"/)
    const values = match?.[1]?.split(/\s+/).map(Number)
    return values?.length === 4 && values.every(Number.isFinite)
      ? (values as [number, number, number, number])
      : null
  }, [previewSvg])
  const firstCalibrationPoint = calibrationPoints[0]
  const secondCalibrationPoint = calibrationPoints[1]
  const measuredDrawingDistance =
    firstCalibrationPoint && secondCalibrationPoint
      ? Math.hypot(
          secondCalibrationPoint[0] - firstCalibrationPoint[0],
          secondCalibrationPoint[1] - firstCalibrationPoint[1],
        )
      : 0

  const built = useMemo(
    () =>
      directGraph
        ? filterIfcGraph(directGraph, levels, categories)
        : document
          ? buildGraph(document, {
              importId,
              levels,
              categories,
              metersPerUnit,
              wallHeight,
              wallThickness,
            })
          : null,
    [directGraph, document, importId, levels, categories, metersPerUnit, wallHeight, wallThickness],
  )
  const reviewedGraph = useMemo(
    () => (built ? applyGraphReview(built.graph, graphReview) : null),
    [built, graphReview],
  )
  const reviewedCounts = useMemo(
    () => (reviewedGraph ? countGraphObjects(reviewedGraph) : null),
    [reviewedGraph],
  )
  const reviewedIfcModel = useMemo(() => {
    if (!ifcMeshModel || !directGraph) return ifcMeshModel
    const selectedLevelIds = new Set(
      levels.filter((level) => level.selected).map((level) => level.id),
    )
    const selectedStoreys = new Set<number>()
    for (const levelId of selectedLevelIds) {
      const metadata = directGraph.nodes[levelId]?.metadata as Record<string, unknown> | undefined
      if (typeof metadata?.expressID === 'number') selectedStoreys.add(metadata.expressID)
    }
    return filterIfcMeshModel(ifcMeshModel, selectedStoreys, new Set(excludedIfcProductIds))
  }, [directGraph, excludedIfcProductIds, ifcMeshModel, levels])
  const selectedLevelCount = levels.filter((level) => level.selected).length

  async function inspect(nextFile: File) {
    const kind = sourceKindFor(nextFile)
    if (!kind) {
      setError('Choose a DWG, DXF, IFC, PDF, PNG, JPEG, or WebP file.')
      return
    }
    if (!nextFile.size) {
      setError('The selected file is empty.')
      return
    }
    const browserLimit = kind === 'pdf' || kind === 'image' ? 75 : 250
    if (nextFile.size > browserLimit * 1024 * 1024) {
      setError(`${kind.toUpperCase()} files are limited to ${browserLimit} MB in this converter.`)
      return
    }
    setBusy(true)
    setWorkingMessage('Reading source file…')
    setError('')
    setFile(nextFile)
    setSourceKind(kind)
    setDocument(null)
    setDirectGraph(null)
    setIfcMeshModel(null)
    setIncludeFaithfulIfc(true)
    setIfcOrientation({ ...DEFAULT_IFC_ORIENTATION })
    setAnalysis(null)
    setPreviewSvg('')
    setImportId(crypto.randomUUID().replaceAll('-', '').slice(0, 16))
    setGraphReview(emptyGraphReview())
    setSelectedNodeId(null)
    setExcludedIfcProductIds([])
    setIfcProductSelection(null)
    setRasterGuideImages([])
    setCategories({ ...defaultCategories, furniture: kind === 'ifc' })
    try {
      if (kind === 'ifc') {
        setWorkingMessage('Initializing IFC geometry engine…')
        const { convertIfcToPascal } = await import('../lib/ifc-converter')
        const bytes = new Uint8Array(await nextFile.arrayBuffer())
        const [semanticResult, meshResult] = await Promise.allSettled([
          convertIfcToPascal(bytes, (message) => setWorkingMessage(message)),
          extractIfcMeshModel(bytes, {
            onProgress: (message) => setWorkingMessage(message),
          }),
        ])
        if (semanticResult.status === 'rejected' && meshResult.status === 'rejected') {
          const semanticMessage =
            semanticResult.reason instanceof Error
              ? semanticResult.reason.message
              : 'Semantic conversion failed.'
          const meshMessage =
            meshResult.reason instanceof Error
              ? meshResult.reason.message
              : 'Geometry conversion failed.'
          throw new Error(`The IFC could not be read. ${semanticMessage} ${meshMessage}`)
        }
        const meshModel = meshResult.status === 'fulfilled' ? meshResult.value : null
        const graph =
          semanticResult.status === 'fulfilled'
            ? normalizeIfcGraph(semanticResult.value as unknown as PortableGraph)
            : createIfcFallbackGraph(meshModel as IfcMeshModel)
        const ifcAnalysis = analyzeIfcGraph(graph)
        if (meshModel) {
          ifcAnalysis.warnings.push(
            `${meshModel.elementCount.toLocaleString()} IFC products and ${meshModel.triangleCount.toLocaleString()} triangles were preserved as faithful model geometry.`,
            'Recognized elements are also exported as native Ostrid nodes. The faithful model remains available for products and shapes that cannot yet be represented parametrically.',
          )
        } else {
          const reason =
            meshResult.status === 'rejected' && meshResult.reason instanceof Error
              ? meshResult.reason.message
              : 'No renderable geometry was returned.'
          ifcAnalysis.warnings.push(
            `Faithful IFC geometry was unavailable (${reason}) The native editable mapping can still be exported.`,
          )
        }
        if (semanticResult.status === 'rejected') {
          ifcAnalysis.warnings.push(
            'Native IFC inference failed for this authoring style. The complete tessellated model is still available for review and export.',
          )
        }
        setDirectGraph(graph)
        setIfcMeshModel(meshModel)
        setAnalysis(ifcAnalysis)
        setLevels(ifcAnalysis.levels)
        setMetersPerUnit(1)
        setComponentName(safeBaseName(nextFile.name))
        setPreviewSvg(createIfcPreviewSvg(graph))
        setView(meshModel ? '3d' : '2d')
        return
      }

      if (kind === 'pdf' || kind === 'image') {
        setWorkingMessage(kind === 'pdf' ? 'Rendering PDF pages…' : 'Reading image pixels…')
        const { inspectRasterFile } = await import('../lib/raster-client')
        const result = await inspectRasterFile(nextFile)
        const viewBox = result.previewSvg.match(/viewBox="[^\s]+\s+[^\s]+\s+([^\s]+)\s+/)
        const previewWidth = Number(viewBox?.[1] ?? 2000)
        setDocument(result.document)
        setAnalysis(result.analysis)
        setLevels(result.analysis.levels)
        setMetersPerUnit(20 / Math.max(1, previewWidth))
        setComponentName(safeBaseName(nextFile.name))
        setPreviewSvg(result.previewSvg)
        setRasterGuideImages(result.guideImages)
        return
      }

      const extension = kind
      let response: Response
      const blobEnabled = process.env.NEXT_PUBLIC_BLOB_UPLOADS_ENABLED === 'true'
      if (blobEnabled) {
        const blob = await upload(`sources/${nextFile.name}`, nextFile, {
          access: 'private',
          handleUploadUrl: '/api/upload',
          multipart: nextFile.size > 90 * 1024 * 1024,
          clientPayload: JSON.stringify({ kind: extension }),
        })
        response = await fetch('/api/inspect/cad', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ blobUrl: blob.url, fileName: nextFile.name, kind: extension }),
        })
      } else {
        response = await fetch('/api/inspect/cad', {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'x-file-name': encodeURIComponent(nextFile.name),
            'x-ostrid-cad-type': extension,
          },
          body: nextFile,
        })
      }
      const result = (await response.json()) as InspectResult
      if (!response.ok) throw new Error(result.error || 'The drawing could not be inspected.')
      const cadDocument =
        result.document ??
        (result.documentUrl
          ? await fetch(result.documentUrl).then((draft) => {
              if (!draft.ok)
                throw new Error('The private conversion draft could not be downloaded.')
              return draft.json() as Promise<CadDocument>
            })
          : null)
      if (!cadDocument) throw new Error('The converter returned no CAD document.')
      setDocument(cadDocument)
      setAnalysis(result.analysis)
      setLevels(result.analysis.levels)
      setMetersPerUnit(metersPerUnitFor(result.analysis.sourceUnit))
      setComponentName(safeBaseName(nextFile.name))
      setPreviewSvg(result.previewSvg)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Conversion failed.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFile(null)
    setSourceKind(null)
    setDocument(null)
    setDirectGraph(null)
    setIfcMeshModel(null)
    setIncludeFaithfulIfc(true)
    setIfcOrientation({ ...DEFAULT_IFC_ORIENTATION })
    setAnalysis(null)
    setLevels([])
    setPreviewSvg('')
    setError('')
    setCategories({ ...defaultCategories })
    setView('2d')
    setCalibrating(false)
    setCalibrationPoints([])
    setGraphReview(emptyGraphReview())
    setSelectedNodeId(null)
    setExcludedIfcProductIds([])
    setIfcProductSelection(null)
    setRasterGuideImages([])
  }

  function applyCalibration() {
    if (measuredDrawingDistance <= 0 || knownDistance <= 0) return
    setMetersPerUnit(knownDistance / measuredDrawingDistance)
    setCalibrating(false)
  }

  async function download() {
    if (!reviewedGraph || !file || !sourceKind || !levels.some((level) => level.selected)) return
    setError('')
    setBusy(true)
    setWorkingMessage('Packaging the Ostrid component…')
    try {
      const graphWithRasterGuides =
        (sourceKind === 'pdf' || sourceKind === 'image') && rasterGuideImages.length
          ? addRasterGuideNodes(reviewedGraph, rasterGuideImages, metersPerUnit)
          : reviewedGraph
      const orientedGraph =
        sourceKind === 'ifc'
          ? withBuildingRotation(graphWithRasterGuides, ifcOrientation)
          : graphWithRasterGuides
      const graph =
        sourceKind === 'ifc' && reviewedIfcModel && includeFaithfulIfc
          ? addIfcReferenceNode(orientedGraph, reviewedIfcModel)
          : orientedGraph
      const component = createGraphComponent({
        name: componentName,
        graph,
        source: {
          format: sourceKind,
          fileName: file.name,
          converter: 'ostrid-converter',
          options: {
            metersPerUnit,
            wallHeight,
            wallThickness,
            categories,
            levels: levels.map(({ name, selected }) => ({ name, selected })),
            ifcOrientationDegrees: ifcOrientation,
            review: {
              addedObjects: Object.keys(graphReview.addedNodes).length,
              removedObjects: graphReview.removedNodeIds.length,
              editedObjects: Object.keys(graphReview.nodePatches).length,
              excludedIfcProducts: excludedIfcProductIds.length,
            },
          },
        },
      })
      let blob: Blob
      let extension: string
      if (sourceKind === 'ifc' && reviewedIfcModel && includeFaithfulIfc) {
        setWorkingMessage('Encoding faithful IFC geometry as GLB…')
        const glb = await exportIfcModelGlb(reviewedIfcModel)
        setWorkingMessage('Creating self-contained Ostrid component bundle…')
        const bundle = createComponentBundle(component, glb)
        blob = new Blob([bundle.slice().buffer], {
          type: 'application/vnd.ostrid.component+zip',
        })
        extension = '.ostrid-component'
      } else if ((sourceKind === 'pdf' || sourceKind === 'image') && rasterGuideImages.length) {
        setWorkingMessage('Embedding source pages as editable Ostrid guide images…')
        const assets = Object.fromEntries(
          await Promise.all(
            rasterGuideImages.map(async (image) => {
              const response = await fetch(image.dataUrl)
              const buffer = await response.arrayBuffer()
              return [image.fileName, new Uint8Array(buffer)] as const
            }),
          ),
        )
        const bundle = createComponentBundle(component, assets)
        blob = new Blob([bundle.slice().buffer], {
          type: 'application/vnd.ostrid.component+zip',
        })
        extension = '.ostrid-component'
      } else {
        blob = new Blob([JSON.stringify(component, null, 2)], { type: 'application/json' })
        extension = '.ostrid-component.json'
      }
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = `${safeBaseName(componentName).replace(/\s+/g, '-').toLowerCase()}${extension}`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The component could not be packaged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">O</div>
          <div>
            <div className="eyebrow">Ostrid Converter</div>
            <strong className="brand-title">Import · review · export</strong>
            <div className="brand-subtitle">Portable GraphComponents for drawings and models</div>
          </div>
        </div>
        <div className="status-pill">
          <LockKeyhole size={14} /> Private processing
        </div>
      </header>
      <section className="hero panel">
        <div className="hero-copy">
          <div className="eyebrow">Review-first pipeline</div>
          <h1>Turn architectural sources into editable Ostrid components.</h1>
          <p>
            Inspect DWG, DXF, IFC, PDF, or image imports in a dark, product-ready workspace, then
            tune the inferred floors, geometry, and native mappings before export.
          </p>
          <div className="hero-chips">
            <span className="hero-chip">Import · inspect · export</span>
            <span className="hero-chip">2D source + 3D review</span>
            <span className="hero-chip">Local when possible</span>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-label">Workflow</div>
          <div className="hero-steps">
            <div className="hero-step">
              <span>1</span>
              <div>
                <strong>Parse the source</strong>
                <small>Detect floors, native objects, and faithful geometry.</small>
              </div>
            </div>
            <div className="hero-step">
              <span>2</span>
              <div>
                <strong>Review the inference</strong>
                <small>Adjust scale, orientation, and object mappings.</small>
              </div>
            </div>
            <div className="hero-step">
              <span>3</span>
              <div>
                <strong>Export the bundle</strong>
                <small>Ship a portable GraphComponent ready for Ostrid.</small>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="grid">
        <aside className="panel sidebar">
          <section className="section">
            <div className="row">
              <h2 className="section-title">Source drawing</h2>
              {file && (
                <button className="tab" type="button" onClick={reset}>
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".dwg,.dxf,.ifc,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,image/*"
              onChange={(event) => event.target.files?.[0] && inspect(event.target.files[0])}
            />
            <button
              className={`dropzone ${dragging ? 'active' : ''}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                const dropped = event.dataTransfer.files[0]
                if (dropped) inspect(dropped)
              }}
            >
              <div>
                <FileUp size={25} style={{ margin: '0 auto 10px', color: 'var(--purple)' }} />
                <strong>{file?.name ?? 'Drop a plan or building model'}</strong>
                <br />
                <small>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : 'DWG · DXF · IFC · PDF · PNG · JPEG · WebP · GIF · BMP · AVIF'}
                </small>
              </div>
            </button>
            {error && (
              <div className="error" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}
          </section>
          {analysis && (
            <>
              <section className="section">
                <h2 className="section-title">Component</h2>
                <input
                  aria-label="Component name"
                  className="input"
                  value={componentName}
                  onChange={(event) => setComponentName(event.target.value)}
                />
              </section>
              <section className="section">
                <div className="row">
                  <h2 className="section-title">Floors</h2>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {selectedLevelCount} selected
                  </span>
                </div>
                {levels.map((level, index) => (
                  <div className="level" key={level.id}>
                    <div className="row">
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={level.selected}
                          onChange={(event) =>
                            setLevels((current) =>
                              current.map((item) =>
                                item.id === level.id
                                  ? { ...item, selected: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        <span>Floor {index + 1}</span>
                      </label>
                      <span className="confidence">{level.confidence}</span>
                    </div>
                    <input
                      aria-label={`Floor ${index + 1} name`}
                      className="input"
                      value={level.name}
                      onChange={(event) =>
                        setLevels((current) =>
                          current.map((item) =>
                            item.id === level.id ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </section>
              <section className="section">
                <h2 className="section-title">Native editable mapping</h2>
                {(Object.keys(categoryLabels) as ImportCategory[]).map((category) => (
                  <label className="check-row" key={category}>
                    <input
                      type="checkbox"
                      disabled={category === 'furniture' && sourceKind !== 'ifc'}
                      checked={categories[category]}
                      onChange={(event) =>
                        setCategories((current) => ({
                          ...current,
                          [category]: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      {category === 'furniture' && sourceKind === 'ifc'
                        ? 'Furniture / items'
                        : categoryLabels[category]}
                    </span>
                    <span className="count">
                      {category === 'furniture'
                        ? analysis.counts.furniture
                        : (reviewedCounts?.[category] ?? analysis.counts[category])}
                    </span>
                  </label>
                ))}
                {sourceKind === 'ifc' && reviewedIfcModel && (
                  <label className="check-row" style={{ marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={includeFaithfulIfc}
                      onChange={(event) => setIncludeFaithfulIfc(event.target.checked)}
                    />
                    <span>Faithful IFC geometry fallback</span>
                    <span className="count">{reviewedIfcModel.elementCount}</span>
                  </label>
                )}
              </section>
              {reviewedGraph && (
                <section className="section">
                  <div className="row">
                    <h2 className="section-title">Review & edit objects</h2>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {Object.keys(reviewedGraph.nodes).length}
                    </span>
                  </div>
                  <small className="muted">
                    Select an object in this list or the 3D preview. Rename, move, resize, hide, or
                    remove it; add missing basics to any floor.
                  </small>
                  <GraphReviewEditor
                    graph={reviewedGraph}
                    review={graphReview}
                    selectedNodeId={selectedNodeId}
                    onReviewChange={setGraphReview}
                    onSelectedNodeChange={setSelectedNodeId}
                    onRemoveNode={(node) => {
                      const metadata = node.metadata as Record<string, unknown> | undefined
                      if (typeof metadata?.expressID === 'number') {
                        setExcludedIfcProductIds((current) => [
                          ...new Set([...current, metadata.expressID as number]),
                        ])
                      }
                    }}
                  />
                </section>
              )}
              {sourceKind === 'ifc' && ifcMeshModel && (
                <section className="section">
                  <div className="row">
                    <h2 className="section-title">Faithful IFC products</h2>
                    {excludedIfcProductIds.length > 0 && (
                      <button
                        type="button"
                        className="tab"
                        onClick={() => setExcludedIfcProductIds([])}
                      >
                        Restore {excludedIfcProductIds.length}
                      </button>
                    )}
                  </div>
                  {ifcProductSelection ? (
                    <div className="ifc-product-review">
                      <strong>{ifcProductSelection.name}</strong>
                      <small>
                        {ifcProductSelection.ifcType} · #{ifcProductSelection.expressId}
                      </small>
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          const expressId = ifcProductSelection.expressId
                          setExcludedIfcProductIds((current) => [
                            ...new Set([...current, expressId]),
                          ])
                          if (directGraph) {
                            const nativeIds = Object.values(directGraph.nodes)
                              .filter((node) => {
                                const metadata = node.metadata as
                                  | Record<string, unknown>
                                  | undefined
                                return metadata?.expressID === expressId
                              })
                              .map((node) => String(node.id))
                            setGraphReview((current) => nativeIds.reduce(removeReviewNode, current))
                          }
                          setIfcProductSelection(null)
                        }}
                      >
                        Remove selected IFC product
                      </button>
                    </div>
                  ) : (
                    <small className="muted">Pick any product in the 3D faithful preview.</small>
                  )}
                </section>
              )}
              <section className="section">
                <h2 className="section-title">Geometry</h2>
                <small className="muted">{analysis.sourceUnitReason}</small>
                {sourceKind !== 'ifc' && (
                  <>
                    <div className="field">
                      <label htmlFor="meters-per-unit">Metres per drawing unit</label>
                      <input
                        id="meters-per-unit"
                        className="input"
                        type="number"
                        min="0.000001"
                        step="0.001"
                        value={metersPerUnit}
                        onChange={(event) =>
                          setMetersPerUnit(Math.max(0.000001, Number(event.target.value)))
                        }
                      />
                    </div>
                    <div className="calibration">
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          setView('2d')
                          setCalibrating((current) => !current)
                          setCalibrationPoints([])
                        }}
                      >
                        {calibrating ? 'Cancel calibration' : 'Calibrate from drawing'}
                      </button>
                      {calibrating && (
                        <>
                          <small className="muted">
                            Click two endpoints of a known dimension in the 2D preview.
                          </small>
                          <div className="field">
                            <label htmlFor="known-distance">Known real distance (m)</label>
                            <input
                              id="known-distance"
                              className="input"
                              type="number"
                              min="0.001"
                              step="0.1"
                              value={knownDistance}
                              onChange={(event) => setKnownDistance(Number(event.target.value))}
                            />
                          </div>
                          <small className="muted">
                            Measured: {measuredDrawingDistance.toFixed(3)} drawing units
                          </small>
                          <button
                            type="button"
                            className="button primary"
                            disabled={!measuredDrawingDistance || knownDistance <= 0}
                            onClick={applyCalibration}
                          >
                            Apply calibrated scale
                          </button>
                        </>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor="wall-height">Wall height (m)</label>
                      <input
                        id="wall-height"
                        className="input"
                        type="number"
                        min="1"
                        step="0.1"
                        value={wallHeight}
                        onChange={(event) => setWallHeight(Number(event.target.value))}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="wall-thickness">Wall thickness (m)</label>
                      <input
                        id="wall-thickness"
                        className="input"
                        type="number"
                        min="0.03"
                        step="0.01"
                        value={wallThickness}
                        onChange={(event) => setWallThickness(Number(event.target.value))}
                      />
                    </div>
                  </>
                )}
                {sourceKind === 'ifc' && (
                  <div className="orientation-control">
                    <div>
                      <strong>Model orientation</strong>
                      <small>X = tilt · Y = plan heading/up · Z = roll</small>
                    </div>
                    {(['x', 'y', 'z'] as Axis[]).map((axis) => (
                      <div className="orientation-axis" key={axis}>
                        <strong className={`axis-${axis}`}>{axis.toUpperCase()}</strong>
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            setIfcOrientation((current) => ({
                              ...current,
                              [axis]: (current[axis] - 90 + 360) % 360,
                            }))
                          }
                        >
                          −90°
                        </button>
                        <span>{ifcOrientation[axis]}°</span>
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            setIfcOrientation((current) => ({
                              ...current,
                              [axis]: (current[axis] + 90) % 360,
                            }))
                          }
                        >
                          +90°
                        </button>
                      </div>
                    ))}
                    {Object.values(ifcOrientation).some(Boolean) && (
                      <button
                        type="button"
                        className="tab"
                        onClick={() => setIfcOrientation({ ...DEFAULT_IFC_ORIENTATION })}
                      >
                        Reset orientation
                      </button>
                    )}
                  </div>
                )}
                {analysis.warnings.map((warning) => (
                  <div className="warning" key={warning}>
                    {warning}
                  </div>
                ))}
              </section>
              <section className="section">
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    !reviewedGraph?.rootNodeIds.length ||
                    !componentName.trim() ||
                    !levels.some((level) => level.selected)
                  }
                  onClick={download}
                >
                  {sourceKind === 'ifc' ? 'Export faithful IFC component' : 'Export GraphComponent'}
                </button>
                <div className="privacy">
                  IFC, PDF, and images are processed locally in your browser. Hosted CAD sources are
                  deleted after parsing; private drafts use a 15-minute access link and scheduled
                  cleanup. Nothing is added to Ostrid until you import the exported component.
                </div>
              </section>
            </>
          )}
        </aside>
        <section className="panel canvas">
          <div className="canvas-head">
            <div className="row">
              <Box size={16} />
              <strong>{file ? 'Import review' : 'Drawing preview'}</strong>
            </div>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${view === '2d' ? 'selected' : ''}`}
                onClick={() => setView('2d')}
              >
                2D source
              </button>
              <button
                type="button"
                className={`tab ${view === '3d' ? 'selected' : ''}`}
                onClick={() => setView('3d')}
              >
                {sourceKind === 'ifc' ? '3D faithful' : '3D inferred'}
              </button>
            </div>
          </div>
          <div className="viewport">
            {busy ? (
              <div className="empty">
                <div>
                  <div className="spinner" />
                  <strong>Inspecting source</strong>
                  {workingMessage}
                </div>
              </div>
            ) : !document && !directGraph ? (
              <div className="empty">
                <div>
                  <strong>Your review canvas is ready</strong>Drop a drawing to inspect it before
                  export.
                </div>
              </div>
            ) : view === '2d' ? (
              <PlanPreview
                previewSvg={previewSvg}
                viewBox={previewViewBox}
                calibrating={calibrating}
                calibrationPoints={calibrationPoints}
                rotationDegrees={sourceKind === 'ifc' ? ifcOrientation.y : 0}
                onCalibrationPoint={(point) =>
                  setCalibrationPoints((current) =>
                    current.length >= 2 ? [point] : [...current, point],
                  )
                }
              />
            ) : sourceKind === 'ifc' && reviewedIfcModel?.primitives.length ? (
              <IfcModelPreview
                model={reviewedIfcModel}
                orientationDegrees={ifcOrientation}
                onSelectionChange={setIfcProductSelection}
              />
            ) : (
              <InferredModelPreview
                nodes={reviewedGraph?.nodes ?? {}}
                selectedNodeId={selectedNodeId}
                onSelectedNodeChange={setSelectedNodeId}
              />
            )}
            {(document || directGraph) && (
              <div className="status">
                {levels.filter((level) => level.selected).length} floors ·{' '}
                {reviewedCounts?.walls ?? 0} walls
                {reviewedIfcModel && ` · ${reviewedIfcModel.elementCount} preserved IFC products`}
                {sourceKind !== 'ifc' && ` · scale ${(metersPerUnit * 1000).toFixed(3)} mm/unit`}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
