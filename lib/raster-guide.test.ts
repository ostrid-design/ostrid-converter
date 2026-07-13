import { describe, expect, test } from 'bun:test'
import { addRasterGuideNodes } from './raster-guide'

describe('raster guide preservation', () => {
  test('attaches the embedded source image to its imported level at calibrated scale', () => {
    const graph = addRasterGuideNodes(
      {
        nodes: {
          building: { id: 'building', type: 'building', children: ['level'] },
          level: {
            id: 'level',
            type: 'level',
            parentId: 'building',
            children: [],
            metadata: { sourceLevelId: 'level-candidate-1' },
          },
        },
        rootNodeIds: ['building'],
      },
      [
        {
          levelCandidateId: 'level-candidate-1',
          fileName: 'source-page-1.jpg',
          width: 1000,
          height: 800,
          dataUrl: 'data:image/jpeg;base64,AA==',
        },
      ],
      0.01,
    )
    const guide = Object.values(graph.nodes).find((node) => node.type === 'guide')
    expect(guide?.parentId).toBe('level')
    expect(guide?.url).toBe('asset://embedded/source-page-1.jpg')
    expect(guide?.scale).toBe(1)
  })
})
