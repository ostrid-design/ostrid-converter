import type { CadAnalysis, CadDocument, CadEntity, LevelCandidate } from './types'

export type RasterPage = {
  name: string
  width: number
  height: number
  dataUrl: string
  imageData: ImageData
}

export type RasterInspection = {
  document: CadDocument
  analysis: CadAnalysis
  previewSvg: string
  guideImages: Array<{
    levelCandidateId: string
    fileName: string
    width: number
    height: number
    dataUrl: string
  }>
}

type Segment = { x1: number; y1: number; x2: number; y2: number; hits: number }

function grayscale(data: Uint8ClampedArray, offset: number) {
  return (
    (data[offset] ?? 255) * 0.299 +
    (data[offset + 1] ?? 255) * 0.587 +
    (data[offset + 2] ?? 255) * 0.114
  )
}

function otsuThreshold(image: ImageData) {
  const histogram = new Array<number>(256).fill(0)
  const { data } = image
  for (let offset = 0; offset < data.length; offset += 16) {
    histogram[Math.round(grayscale(data, offset))] += 1
  }
  const total = histogram.reduce((sum, value) => sum + value, 0)
  let weightedTotal = 0
  histogram.forEach((count, value) => {
    weightedTotal += value * count
  })
  let backgroundWeight = 0
  let backgroundSum = 0
  let maximum = 0
  let threshold = 160
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value] ?? 0
    if (!backgroundWeight) continue
    const foregroundWeight = total - backgroundWeight
    if (!foregroundWeight) break
    backgroundSum += value * (histogram[value] ?? 0)
    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2
    if (variance > maximum) {
      maximum = variance
      threshold = value
    }
  }
  return Math.min(205, Math.max(70, threshold + 18))
}

function isDark(image: ImageData, x: number, y: number, threshold: number) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4
  return (image.data[offset + 3] ?? 0) > 64 && grayscale(image.data, offset) < threshold
}

function scanRuns(image: ImageData, horizontal: boolean, threshold: number): Segment[] {
  const primarySize = horizontal ? image.height : image.width
  const secondarySize = horizontal ? image.width : image.height
  const minimumLength = Math.max(22, Math.round(secondarySize * 0.035))
  const raw: Segment[] = []
  for (let primary = 0; primary < primarySize; primary += 2) {
    let start = -1
    let lastDark = -1
    for (let secondary = 0; secondary <= secondarySize; secondary += 1) {
      const dark =
        secondary < secondarySize &&
        isDark(image, horizontal ? secondary : primary, horizontal ? primary : secondary, threshold)
      if (dark) {
        if (start < 0) start = secondary
        lastDark = secondary
      }
      const gap = start >= 0 ? secondary - lastDark : 0
      if (start >= 0 && !dark && gap > 2) {
        if (lastDark - start >= minimumLength) {
          raw.push(
            horizontal
              ? { x1: start, y1: primary, x2: lastDark, y2: primary, hits: 1 }
              : { x1: primary, y1: start, x2: primary, y2: lastDark, hits: 1 },
          )
        }
        start = -1
        lastDark = -1
      }
    }
  }
  return raw
}

function overlapRatio(a1: number, a2: number, b1: number, b2: number) {
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
  return overlap / Math.max(1, Math.min(a2 - a1, b2 - b1))
}

function mergeSegments(input: Segment[], horizontal: boolean) {
  const merged: Segment[] = []
  for (const segment of input) {
    const cross = horizontal ? segment.y1 : segment.x1
    const along1 = horizontal ? segment.x1 : segment.y1
    const along2 = horizontal ? segment.x2 : segment.y2
    const match = merged.find((candidate) => {
      const candidateCross = horizontal ? candidate.y1 : candidate.x1
      const candidate1 = horizontal ? candidate.x1 : candidate.y1
      const candidate2 = horizontal ? candidate.x2 : candidate.y2
      return (
        Math.abs(candidateCross - cross) <= 5 &&
        overlapRatio(candidate1, candidate2, along1, along2) > 0.55
      )
    })
    if (!match) {
      merged.push({ ...segment })
      continue
    }
    const hits = match.hits + 1
    const averagedCross = ((horizontal ? match.y1 : match.x1) * match.hits + cross) / hits
    if (horizontal) {
      match.x1 = Math.min(match.x1, segment.x1)
      match.x2 = Math.max(match.x2, segment.x2)
      match.y1 = averagedCross
      match.y2 = averagedCross
    } else {
      match.y1 = Math.min(match.y1, segment.y1)
      match.y2 = Math.max(match.y2, segment.y2)
      match.x1 = averagedCross
      match.x2 = averagedCross
    }
    match.hits = hits
  }
  return merged.filter((segment) => segment.hits >= 1).slice(0, 1800)
}

export function inferRasterSegments(image: ImageData) {
  const threshold = otsuThreshold(image)
  return [
    ...mergeSegments(scanRuns(image, true, threshold), true),
    ...mergeSegments(scanRuns(image, false, threshold), false),
  ]
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function ordinalFloorName(index: number) {
  if (index === 0) return 'Ground Floor'
  if (index === 1) return 'First Floor'
  if (index === 2) return 'Second Floor'
  if (index === 3) return 'Third Floor'
  return `Floor ${index + 1}`
}

export function buildRasterInspection(pages: RasterPage[]): RasterInspection {
  const gap = 80
  let offsetX = 0
  let maximumHeight = 1
  const entities: CadEntity[] = []
  const levels: LevelCandidate[] = []
  const preview: string[] = []

  pages.forEach((page, pageIndex) => {
    const levelName = page.name || ordinalFloorName(pageIndex)
    const segments = inferRasterSegments(page.imageData)
    const anchor = { x: offsetX + page.width / 2, y: page.height / 2 }
    levels.push({
      id: `level-candidate-${pageIndex + 1}`,
      name: levelName,
      anchor,
      selected: true,
      confidence: page.name ? 'medium' : 'low',
    })
    entities.push({
      type: 'TEXT',
      layer: 'RASTER-TITLE',
      text: levelName,
      startPoint: anchor,
    })
    for (const segment of segments) {
      entities.push({
        type: 'LINE',
        layer: 'RASTER-WALL',
        startPoint: { x: offsetX + segment.x1, y: segment.y1 },
        endPoint: { x: offsetX + segment.x2, y: segment.y2 },
      })
    }
    preview.push(
      `<image href="${escapeXml(page.dataUrl)}" x="${offsetX}" y="0" width="${page.width}" height="${page.height}" preserveAspectRatio="none" opacity="0.78"/>`,
    )
    for (const segment of segments) {
      preview.push(
        `<line x1="${offsetX + segment.x1}" y1="${segment.y1}" x2="${offsetX + segment.x2}" y2="${segment.y2}" stroke="#f97316" stroke-width="2" opacity="0.9"/>`,
      )
    }
    preview.push(
      `<text x="${offsetX + 14}" y="28" fill="#0f172a" font-family="sans-serif" font-size="18" font-weight="700">${escapeXml(levelName)}</text>`,
    )
    maximumHeight = Math.max(maximumHeight, page.height)
    offsetX += page.width + gap
  })

  const width = Math.max(1, offsetX - gap)
  const wallCount = entities.filter((entity) => entity.layer === 'RASTER-WALL').length
  return {
    document: { entities },
    analysis: {
      levels,
      counts: {
        walls: wallCount,
        openings: 0,
        dimensions: 0,
        zones: 0,
        annotations: 0,
        furniture: 0,
      },
      layers: ['RASTER-TITLE', 'RASTER-WALL'],
      sourceUnit: 'm',
      sourceUnitReason:
        'Raster coordinates are pixels. Calibrate against a known drawing dimension before export.',
      warnings: [
        'Raster inference detects long horizontal and vertical dark lines only. Review the orange overlay and calibrate scale before export.',
        'Doors, windows, room labels, angled walls, and furniture are not inferred reliably from raster pixels yet.',
      ],
    },
    previewSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${maximumHeight}" preserveAspectRatio="xMidYMid meet"><rect width="${width}" height="${maximumHeight}" fill="#f8fafc"/>${preview.join('')}</svg>`,
    guideImages: pages.map((page, pageIndex) => ({
      levelCandidateId: `level-candidate-${pageIndex + 1}`,
      fileName: `source-page-${pageIndex + 1}.jpg`,
      width: page.width,
      height: page.height,
      dataUrl: page.dataUrl,
    })),
  }
}

export function suggestedPixelScale(pages: RasterPage[]) {
  const widest = Math.max(...pages.map((page) => page.width), 1)
  return 20 / widest
}
