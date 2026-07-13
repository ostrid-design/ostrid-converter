import { buildRasterInspection, type RasterInspection, type RasterPage } from './raster'

const MAX_PAGES = 16
const MAX_DIMENSION = 1600

function canvasPage(canvas: HTMLCanvasElement, name: string): RasterPage {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')
  return {
    name,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/jpeg', 0.86),
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
  }
}

function floorNameFromText(text: string, index: number) {
  const match = text.match(
    /\b(ground|first|second|third|fourth|basement|mezzanine|roof|covered)\s+floor\b|\bfloor\s+([1-9])\b/i,
  )
  if (match?.[1]) return `${match[1][0]?.toUpperCase()}${match[1].slice(1).toLowerCase()} Floor`
  if (match?.[2]) return `Floor ${match[2]}`
  if (index === 0) return 'Ground Floor'
  if (index === 1) return 'First Floor'
  if (index === 2) return 'Second Floor'
  return `Floor ${index + 1}`
}

async function inspectPdf(file: File): Promise<RasterInspection> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PAGES)
  const pages: RasterPage[] = []
  for (let index = 0; index < pageCount; index += 1) {
    const page = await pdf.getPage(index + 1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, MAX_DIMENSION / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas image processing is unavailable in this browser.')
    await page.render({ canvas, canvasContext: context, viewport }).promise
    const textContent = await page.getTextContent()
    const text = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.push(canvasPage(canvas, floorNameFromText(text, index)))
  }
  const inspection = buildRasterInspection(pages)
  if (pdf.numPages > MAX_PAGES) {
    inspection.analysis.warnings.push(
      `Only the first ${MAX_PAGES} of ${pdf.numPages} PDF pages were inspected.`,
    )
  }
  return inspection
}

async function inspectImage(file: File): Promise<RasterInspection> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image processing is unavailable in this browser.')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return buildRasterInspection([canvasPage(canvas, 'Ground Floor')])
}

export function inspectRasterFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    ? inspectPdf(file)
    : inspectImage(file)
}
