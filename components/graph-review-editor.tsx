'use client'

import { Eye, EyeOff, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type GraphReview, patchReviewNode, removeReviewNode } from '../lib/graph-review'
import type { PortableGraph } from '../lib/types'

type AddableType = 'wall' | 'door' | 'window' | 'zone' | 'annotation' | 'dimension'

const addableLabels: Record<AddableType, string> = {
  wall: 'Wall',
  door: 'Door',
  window: 'Window',
  zone: 'Zone / room',
  annotation: 'Annotation',
  dimension: 'Dimension',
}

function nodeName(node: Record<string, unknown>) {
  return typeof node.name === 'string' && node.name.trim()
    ? node.name
    : typeof node.type === 'string'
      ? node.type
      : 'Object'
}

function numberAt(value: unknown, index: number, fallback = 0) {
  return Array.isArray(value) && typeof value[index] === 'number' ? value[index] : fallback
}

function safeNumber(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function GraphReviewEditor({
  graph,
  review,
  selectedNodeId,
  onReviewChange,
  onSelectedNodeChange,
  onRemoveNode,
}: {
  graph: PortableGraph
  review: GraphReview
  selectedNodeId: string | null
  onReviewChange: (review: GraphReview) => void
  onSelectedNodeChange: (id: string | null) => void
  onRemoveNode?: (node: Record<string, unknown>) => void
}) {
  const levels = useMemo(
    () => Object.values(graph.nodes).filter((node) => node.type === 'level'),
    [graph],
  )
  const [targetLevelId, setTargetLevelId] = useState('')
  const [addType, setAddType] = useState<AddableType>('wall')
  const [query, setQuery] = useState('')
  const effectiveLevelId =
    targetLevelId && graph.nodes[targetLevelId]
      ? targetLevelId
      : typeof levels[0]?.id === 'string'
        ? levels[0].id
        : ''
  const selected = selectedNodeId ? graph.nodes[selectedNodeId] : undefined
  const objects = useMemo(() => {
    const search = query.trim().toLowerCase()
    return Object.values(graph.nodes)
      .filter(
        (node) =>
          node.type !== 'building' &&
          node.type !== 'level' &&
          node.type !== 'scan' &&
          node.type !== 'guide',
      )
      .filter((node) =>
        search
          ? `${nodeName(node)} ${String(node.type ?? '')}`.toLowerCase().includes(search)
          : true,
      )
      .sort((a, b) => nodeName(a).localeCompare(nodeName(b)))
      .slice(0, 500)
  }, [graph, query])

  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selectedNodeId) return
    onReviewChange(patchReviewNode(review, selectedNodeId, patch))
  }

  const removeSelected = () => {
    if (!selectedNodeId || !selected) return
    onRemoveNode?.(selected)
    onReviewChange(removeReviewNode(review, selectedNodeId))
    onSelectedNodeChange(null)
  }

  const addObject = () => {
    const levelId = effectiveLevelId
    if (!levelId) return
    const stamp = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
    let parentId = levelId
    if (addType === 'door' || addType === 'window') {
      const selectedWall = selected?.type === 'wall' ? selected : undefined
      const wall =
        selectedWall ??
        Object.values(graph.nodes).find((node) => node.type === 'wall' && node.parentId === levelId)
      if (!wall || typeof wall.id !== 'string') return
      parentId = wall.id
    }
    const id = `${addType}_review-${stamp}`
    const common = {
      object: 'node',
      id,
      type: addType,
      name: `Added ${addableLabels[addType].toLowerCase()}`,
      parentId,
      visible: true,
      metadata: { imported: true, reviewAdded: true },
      children: [],
    }
    const geometry: Record<AddableType, Record<string, unknown>> = {
      wall: {
        start: [-2, 0],
        end: [2, 0],
        thickness: 0.18,
        height: 2.8,
        frontSide: 'unknown',
        backSide: 'unknown',
      },
      door: {
        wallId: parentId,
        position: [0, 1.05, 0],
        rotation: [0, 0, 0],
        width: 0.9,
        height: 2.1,
        doorCategory: 'interior',
        doorType: 'hinged',
      },
      window: {
        wallId: parentId,
        position: [0, 1.65, 0],
        rotation: [0, 0, 0],
        width: 1.2,
        height: 1.2,
        openingKind: 'window',
        windowType: 'fixed',
      },
      zone: {
        polygon: [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
        ],
        color: '#8b5cf6',
      },
      annotation: {
        text: 'New annotation',
        anchor: [0, 0],
        elbow: [0.5, -0.35],
        textPosition: [0.8, -0.35],
        fontSize: 0.18,
      },
      dimension: { start: [-1, 0], end: [1, 0], offset: [0, -0.8] },
    }
    onReviewChange({
      ...review,
      addedNodes: { ...review.addedNodes, [id]: { ...common, ...geometry[addType] } },
    })
    onSelectedNodeChange(id)
  }

  const canAddOpening =
    addType !== 'door' && addType !== 'window'
      ? true
      : selected?.type === 'wall' ||
        Object.values(graph.nodes).some(
          (node) => node.type === 'wall' && node.parentId === effectiveLevelId,
        )

  return (
    <div className="object-review">
      <div className="object-add-grid">
        <select
          aria-label="Floor for new object"
          className="input"
          value={effectiveLevelId}
          onChange={(event) => setTargetLevelId(event.target.value)}
        >
          {levels.map((level) => (
            <option key={String(level.id)} value={String(level.id)}>
              {nodeName(level)}
            </option>
          ))}
        </select>
        <div className="row">
          <select
            aria-label="Object type to add"
            className="input"
            value={addType}
            onChange={(event) => setAddType(event.target.value as AddableType)}
          >
            {(Object.keys(addableLabels) as AddableType[]).map((type) => (
              <option key={type} value={type}>
                {addableLabels[type]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button icon-button"
            disabled={!effectiveLevelId || !canAddOpening}
            onClick={addObject}
            aria-label={`Add ${addableLabels[addType]}`}
          >
            <Plus size={15} />
          </button>
        </div>
        {!canAddOpening && (
          <small className="muted">Add a wall before placing a door or window.</small>
        )}
      </div>

      <label className="object-search">
        <Search size={13} />
        <input
          aria-label="Search imported objects"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an object…"
        />
      </label>
      <div className="object-list">
        {objects.map((node) => {
          const id = String(node.id)
          const visible = node.visible !== false
          return (
            <button
              type="button"
              key={id}
              className={`object-row ${selectedNodeId === id ? 'selected' : ''}`}
              onClick={() => onSelectedNodeChange(id)}
            >
              <span>
                <strong>{nodeName(node)}</strong>
                <small>{String(node.type ?? 'object')}</small>
              </span>
              {visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )
        })}
        {!objects.length && <small className="muted">No matching editable objects.</small>}
      </div>

      {review.removedNodeIds.length > 0 && (
        <button
          type="button"
          className="tab restore-objects"
          onClick={() => onReviewChange({ ...review, removedNodeIds: [] })}
        >
          <RotateCcw size={12} /> Restore {review.removedNodeIds.length} removed
        </button>
      )}

      {selected && (
        <div className="object-inspector">
          <div className="row">
            <strong>Edit {String(selected.type ?? 'object')}</strong>
            <button
              type="button"
              className="danger-icon"
              aria-label="Remove selected object"
              onClick={removeSelected}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            aria-label="Object name"
            className="input"
            value={nodeName(selected)}
            onChange={(event) => patchSelected({ name: event.target.value })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={selected.visible !== false}
              onChange={(event) => patchSelected({ visible: event.target.checked })}
            />
            Visible
          </label>
          {(selected.type === 'wall' || selected.type === 'dimension') && (
            <>
              <Vector2Editor
                label="Start X / Z"
                value={selected.start}
                onChange={(start) => patchSelected({ start })}
              />
              <Vector2Editor
                label="End X / Z"
                value={selected.end}
                onChange={(end) => patchSelected({ end })}
              />
            </>
          )}
          {selected.type === 'wall' && (
            <div className="numeric-grid">
              <NumberEditor
                label="Thickness"
                value={selected.thickness}
                fallback={0.18}
                onChange={(thickness) => patchSelected({ thickness })}
              />
              <NumberEditor
                label="Height"
                value={selected.height}
                fallback={2.8}
                onChange={(height) => patchSelected({ height })}
              />
            </div>
          )}
          {(selected.type === 'door' || selected.type === 'window') && (
            <div className="numeric-grid">
              <NumberEditor
                label="Along wall"
                value={numberAt(selected.position, 0)}
                fallback={0}
                onChange={(value) =>
                  patchSelected({
                    position: [
                      value,
                      numberAt(selected.position, 1),
                      numberAt(selected.position, 2),
                    ],
                  })
                }
              />
              <NumberEditor
                label="Centre height"
                value={numberAt(selected.position, 1)}
                fallback={1}
                onChange={(value) =>
                  patchSelected({
                    position: [
                      numberAt(selected.position, 0),
                      value,
                      numberAt(selected.position, 2),
                    ],
                  })
                }
              />
              <NumberEditor
                label="Width"
                value={selected.width}
                fallback={0.9}
                onChange={(width) => patchSelected({ width })}
              />
              <NumberEditor
                label="Height"
                value={selected.height}
                fallback={2.1}
                onChange={(height) => patchSelected({ height })}
              />
            </div>
          )}
          {selected.type === 'annotation' && (
            <>
              <textarea
                aria-label="Annotation text"
                className="input object-textarea"
                value={typeof selected.text === 'string' ? selected.text : ''}
                onChange={(event) =>
                  patchSelected({ text: event.target.value, name: event.target.value.slice(0, 60) })
                }
              />
              <Vector2Editor
                label="Anchor X / Z"
                value={selected.anchor}
                onChange={(anchor) => patchSelected({ anchor })}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NumberEditor({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: unknown
  fallback: number
  onChange: (value: number) => void
}) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        step="0.05"
        value={numeric}
        onChange={(event) => onChange(safeNumber(event.target.value, numeric))}
      />
    </label>
  )
}

function Vector2Editor({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (value: [number, number]) => void
}) {
  const x = numberAt(value, 0)
  const z = numberAt(value, 1)
  return (
    <div className="mini-field">
      <span>{label}</span>
      <div className="numeric-grid">
        <input
          className="input"
          type="number"
          step="0.1"
          value={x}
          onChange={(event) => onChange([safeNumber(event.target.value, x), z])}
        />
        <input
          className="input"
          type="number"
          step="0.1"
          value={z}
          onChange={(event) => onChange([x, safeNumber(event.target.value, z)])}
        />
      </div>
    </div>
  )
}
