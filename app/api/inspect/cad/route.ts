import path from 'node:path'
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import { del, get, issueSignedToken, presignUrl, put } from '@vercel/blob'
import DxfParser, { type IDxf, type IEntity, type IPoint } from 'dxf-parser'
import { analyzeCadDocument, compactCadDocument, createCadPreviewSvg } from '../../../../lib/cad'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_SOURCE_BYTES = 250 * 1024 * 1024

type DxfEntity = IEntity & Record<string, unknown>

function dxfPoint(value: unknown): IPoint | undefined {
  if (!value || typeof value !== 'object') return undefined
  const point = value as Partial<IPoint>
  return typeof point.x === 'number' && typeof point.y === 'number'
    ? { x: point.x, y: point.y, z: point.z ?? 0 }
    : undefined
}

function normalizeDxf(document: IDxf) {
  return {
    header: {
      INSUNITS: document.header.$INSUNITS,
      EXTMIN: document.header.$EXTMIN,
      EXTMAX: document.header.$EXTMAX,
    },
    entities: document.entities.map((input) => {
      const entity = input as DxfEntity
      const vertices = Array.isArray(entity.vertices)
        ? entity.vertices.map(dxfPoint).filter((point): point is IPoint => Boolean(point))
        : undefined
      return {
        type: entity.type,
        layer: entity.layer,
        name: typeof entity.name === 'string' ? entity.name : undefined,
        text: typeof entity.text === 'string' ? entity.text : undefined,
        startPoint: dxfPoint(entity.startPoint) ?? vertices?.[0],
        endPoint: dxfPoint(entity.endPoint) ?? vertices?.[1],
        insertionPoint: dxfPoint(entity.insertionPoint) ?? dxfPoint(entity.position),
        center: dxfPoint(entity.center),
        radius: typeof entity.radius === 'number' ? entity.radius : undefined,
        rotation:
          typeof entity.rotation === 'number' ? (entity.rotation * Math.PI) / 180 : undefined,
        measurement:
          typeof entity.actualMeasurement === 'number' ? entity.actualMeasurement : undefined,
        definitionPoint: dxfPoint(entity.anchorPoint),
        subDefinitionPoint1: dxfPoint(entity.linearOrAngularPoint1),
        subDefinitionPoint2: dxfPoint(entity.linearOrAngularPoint2),
        flag: entity.shape === true ? 1 : 0,
        vertices,
      }
    }),
  }
}

function safeName(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'drawing'
  )
}

async function parseBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as { blobUrl?: string; fileName?: string; kind?: string }
    if (!body.blobUrl || !body.fileName || !/^(dwg|dxf)$/.test(body.kind ?? '')) {
      throw new Error('The Blob URL, file name, and CAD type are required.')
    }
    const source = await get(body.blobUrl, { access: 'private', useCache: false })
    if (source?.statusCode !== 200 || !source.stream)
      throw new Error('The uploaded source could not be read.')
    if ((source.blob.size ?? 0) > MAX_SOURCE_BYTES)
      throw new Error('The CAD file exceeds the 250 MB limit.')
    const buffer = await new Response(source.stream).arrayBuffer()
    return {
      buffer,
      fileName: body.fileName,
      kind: body.kind as 'dwg' | 'dxf',
      blobUrl: body.blobUrl,
    }
  }

  const fileName = decodeURIComponent(request.headers.get('x-file-name') ?? 'drawing.dwg')
  const kind = request.headers.get('x-ostrid-cad-type')
  if (kind !== 'dwg' && kind !== 'dxf')
    throw new Error('The x-ostrid-cad-type header must be dwg or dxf.')
  const buffer = await request.arrayBuffer()
  if (!buffer.byteLength || buffer.byteLength > MAX_SOURCE_BYTES)
    throw new Error('The CAD file must be between 1 byte and 250 MB.')
  return { buffer, fileName, kind, blobUrl: null }
}

export async function POST(request: Request) {
  let sourceBlobUrl: string | null = null
  try {
    const source = await parseBody(request)
    sourceBlobUrl = source.blobUrl
    let raw: unknown
    if (source.kind === 'dxf') {
      const parsed = new DxfParser().parseSync(
        new TextDecoder('utf-8', { fatal: true }).decode(source.buffer),
      )
      if (!parsed) throw new Error('The ASCII DXF could not be parsed.')
      raw = normalizeDxf(parsed)
    } else {
      const wasmDirectory = path.join(process.cwd(), 'node_modules/@mlightcad/libredwg-web/wasm/')
      const libreDwg = await LibreDwg.create(wasmDirectory)
      const pointer = libreDwg.dwg_read_data(source.buffer, Dwg_File_Type.DWG)
      if (!pointer)
        throw new Error(
          'LibreDWG could not parse this file. It may use an unsupported CAD version or be damaged.',
        )
      try {
        raw = libreDwg.convert(pointer)
      } finally {
        libreDwg.dwg_free(pointer)
      }
    }
    const document = compactCadDocument(raw)
    if (!document.entities.length)
      throw new Error('No supported model-space entities were found in the drawing.')
    const analysis = analyzeCadDocument(document)
    const previewSvg = createCadPreviewSvg(document)

    if (source.blobUrl) {
      const draft = await put(
        `drafts/${safeName(source.fileName)}.cad.json`,
        JSON.stringify(document),
        {
          access: 'private',
          addRandomSuffix: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60,
        },
      )
      const validUntil = Date.now() + 15 * 60 * 1000
      const signedToken = await issueSignedToken({
        pathname: draft.pathname,
        operations: ['get'],
        validUntil,
      })
      const { presignedUrl } = await presignUrl(signedToken, {
        access: 'private',
        operation: 'get',
        pathname: draft.pathname,
        validUntil,
      })
      return Response.json({ documentUrl: presignedUrl, analysis, previewSvg })
    }
    return Response.json({ document, analysis, previewSvg })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CAD inspection failed.'
    return Response.json({ error: message }, { status: 422 })
  } finally {
    if (sourceBlobUrl) {
      try {
        await del(sourceBlobUrl)
      } catch {
        // The scheduled cleanup is the fallback if immediate source deletion fails.
      }
    }
  }
}
