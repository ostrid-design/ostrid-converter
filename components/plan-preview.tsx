'use client'

import { Maximize2, Minus, Move, Plus } from 'lucide-react'
import { useRef, useState } from 'react'

type Point = [number, number]

export function PlanPreview({
  previewSvg,
  viewBox,
  calibrating,
  calibrationPoints,
  rotationDegrees = 0,
  onCalibrationPoint,
}: {
  previewSvg: string
  viewBox: [number, number, number, number] | null
  calibrating: boolean
  calibrationPoints: Point[]
  rotationDegrees?: number
  onCalibrationPoint: (point: Point) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState<Point>([0, 0])

  const zoomAt = (nextScale: number, clientX?: number, clientY?: number) => {
    const host = hostRef.current
    if (!host) return
    const clamped = Math.min(12, Math.max(0.2, nextScale))
    const rect = host.getBoundingClientRect()
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
    const ratio = clamped / scale
    setPan([x - (x - pan[0]) * ratio, y - (y - pan[1]) * ratio])
    setScale(clamped)
  }

  const resetView = () => {
    setScale(1)
    setPan([0, 0])
  }

  const screenToDrawing = (clientX: number, clientY: number): Point | null => {
    const host = hostRef.current
    if (!host || !viewBox) return null
    const rect = host.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    let x = (clientX - rect.left - centerX - pan[0]) / scale
    let y = (clientY - rect.top - centerY - pan[1]) / scale
    const radians = (-rotationDegrees * Math.PI) / 180
    const rotatedX = x * Math.cos(radians) - y * Math.sin(radians)
    const rotatedY = x * Math.sin(radians) + y * Math.cos(radians)
    x = rotatedX + centerX
    y = rotatedY + centerY
    const [minX, minY, width, height] = viewBox
    const fitScale = Math.min(rect.width / width, rect.height / height)
    const offsetX = (rect.width - width * fitScale) / 2
    const offsetY = (rect.height - height * fitScale) / 2
    return [minX + (x - offsetX) / fitScale, minY + (y - offsetY) / fitScale]
  }

  return (
    <div
      ref={hostRef}
      className={`cad-preview ${calibrating ? 'calibrating' : ''}`}
      role="application"
      aria-label="2D plan preview. Drag to pan and use the mouse wheel to zoom."
      onDoubleClick={resetView}
      onWheel={(event) => {
        event.preventDefault()
        zoomAt(scale * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY)
      }}
      onPointerDown={(event) => {
        if (calibrating) {
          const point = screenToDrawing(event.clientX, event.clientY)
          if (point) onCalibrationPoint(point)
          return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          pan,
        }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        setPan([drag.pan[0] + event.clientX - drag.x, drag.pan[1] + event.clientY - drag.y])
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
      }}
      onPointerCancel={() => {
        dragRef.current = null
      }}
    >
      <div
        className="cad-preview-content"
        style={{
          transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${scale}) rotate(${rotationDegrees}deg)`,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: the preview is generated SVG data, not a site asset */}
        <img
          alt="Plan source preview"
          draggable={false}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}`}
        />
        {viewBox && calibrationPoints.length > 0 && (
          <svg viewBox={viewBox.join(' ')} aria-hidden="true">
            {calibrationPoints.length === 2 && (
              <line
                x1={calibrationPoints[0]?.[0] ?? 0}
                y1={calibrationPoints[0]?.[1] ?? 0}
                x2={calibrationPoints[1]?.[0] ?? 0}
                y2={calibrationPoints[1]?.[1] ?? 0}
              />
            )}
            {calibrationPoints.map((point, index) => (
              <circle
                key={`${point[0]}-${point[1]}`}
                cx={point[0]}
                cy={point[1]}
                r={Math.max(viewBox[2] / 250, 0.1)}
              >
                <title>Calibration point {index + 1}</title>
              </circle>
            ))}
          </svg>
        )}
      </div>
      <div className="preview-navigation">
        <span>
          <Move size={12} /> Drag · wheel to zoom
        </span>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(scale / 1.25)}>
          <Minus size={14} />
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(scale * 1.25)}>
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Reset 2D view" onClick={resetView}>
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}
