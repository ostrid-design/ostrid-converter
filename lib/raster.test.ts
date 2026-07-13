import { describe, expect, test } from 'bun:test'
import { inferRasterSegments } from './raster'

function syntheticPlan() {
  const width = 200
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    data[offset] = 0
    data[offset + 1] = 0
    data[offset + 2] = 0
    data[offset + 3] = 255
  }
  for (let x = 20; x <= 180; x += 1) {
    dark(x, 20)
    dark(x, 22)
    dark(x, 118)
    dark(x, 120)
  }
  for (let y = 20; y <= 120; y += 1) {
    dark(20, y)
    dark(22, y)
    dark(178, y)
    dark(180, y)
  }
  return { width, height, data } as ImageData
}

describe('raster plan inference', () => {
  test('finds long orthogonal wall lines while merging adjacent scan rows', () => {
    const segments = inferRasterSegments(syntheticPlan())
    expect(segments.filter((segment) => segment.y1 === segment.y2).length).toBeGreaterThanOrEqual(2)
    expect(segments.filter((segment) => segment.x1 === segment.x2).length).toBeGreaterThanOrEqual(2)
    expect(segments.length).toBeLessThan(20)
  })
})
