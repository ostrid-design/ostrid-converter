'use client'

import { Maximize2, RotateCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function InferredModelPreview({
  nodes,
  selectedNodeId,
  onSelectedNodeChange,
}: {
  nodes: Record<string, Record<string, unknown>>
  selectedNodeId?: string | null
  onSelectedNodeChange?: (id: string | null) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => undefined)
  const objectCount = Object.values(nodes).filter((node) =>
    ['wall', 'door', 'window', 'zone', 'slab'].includes(String(node.type)),
  ).length
  const visibleObjectCount = Object.values(nodes).filter(
    (node) =>
      node.visible !== false &&
      ['wall', 'door', 'window', 'zone', 'slab'].includes(String(node.type)),
  ).length

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0f0f0f')
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const group = new THREE.Group()
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: '#6456f6',
      roughness: 0.72,
      metalness: 0.02,
    })
    const doorMaterial = new THREE.MeshStandardMaterial({ color: '#1fc9c0', roughness: 0.62 })
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: '#fb8a5b',
      transparent: true,
      opacity: 0.58,
      roughness: 0.24,
    })
    const zoneMaterial = new THREE.MeshStandardMaterial({
      color: '#46d08a',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    })
    const meshById = new Map<string, THREE.Object3D>()
    const elevationFor = (node: Record<string, unknown>) => {
      const parent = nodes[String(node.parentId)]
      const level = parent?.type === 'level' ? parent : nodes[String(parent?.parentId)]
      const metadata = level?.metadata as Record<string, unknown> | undefined
      return typeof metadata?.elevation === 'number'
        ? metadata.elevation
        : typeof level?.elevation === 'number'
          ? level.elevation
          : typeof level?.level === 'number'
            ? level.level * 3
            : 0
    }
    for (const node of Object.values(nodes)) {
      if (
        node.visible === false ||
        node.type !== 'wall' ||
        !Array.isArray(node.start) ||
        !Array.isArray(node.end)
      )
        continue
      const start = node.start as number[]
      const end = node.end as number[]
      if (![start[0], start[1], end[0], end[1]].every((value) => typeof value === 'number')) {
        continue
      }
      const dx = end[0] - start[0]
      const dz = end[1] - start[1]
      const length = Math.hypot(dx, dz)
      if (length < 1e-5) continue
      const elevation = elevationFor(node)
      const height = typeof node.height === 'number' ? node.height : 2.8
      const thickness = typeof node.thickness === 'number' ? node.thickness : 0.18
      const geometry = new THREE.BoxGeometry(length, height, thickness)
      const wall = new THREE.Mesh(geometry, wallMaterial)
      wall.position.set((start[0] + end[0]) / 2, elevation + height / 2, (start[1] + end[1]) / 2)
      wall.rotation.y = -Math.atan2(dz, dx)
      wall.userData.nodeId = String(node.id)
      group.add(wall)
      meshById.set(String(node.id), wall)
    }
    for (const node of Object.values(nodes)) {
      if (node.visible === false || (node.type !== 'door' && node.type !== 'window')) continue
      const wall = nodes[String(node.wallId ?? node.parentId)]
      if (!wall || !Array.isArray(wall.start) || !Array.isArray(wall.end)) continue
      const start = wall.start as number[]
      const end = wall.end as number[]
      const dx = Number(end[0]) - Number(start[0])
      const dz = Number(end[1]) - Number(start[1])
      const length = Math.hypot(dx, dz)
      if (!length) continue
      const position = Array.isArray(node.position) ? node.position : [0, 1, 0]
      const along = typeof position[0] === 'number' ? position[0] : 0
      const width = typeof node.width === 'number' ? node.width : 0.9
      const height = typeof node.height === 'number' ? node.height : 2.1
      const centreHeight = typeof position[1] === 'number' ? position[1] : height / 2
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, 0.08),
        node.type === 'window' ? windowMaterial : doorMaterial,
      )
      mesh.position.set(
        (Number(start[0]) + Number(end[0])) / 2 + (dx / length) * along,
        elevationFor(node) + centreHeight,
        (Number(start[1]) + Number(end[1])) / 2 + (dz / length) * along,
      )
      mesh.rotation.y = -Math.atan2(dz, dx)
      mesh.userData.nodeId = String(node.id)
      group.add(mesh)
      meshById.set(String(node.id), mesh)
    }
    for (const node of Object.values(nodes)) {
      if (
        node.visible === false ||
        (node.type !== 'zone' && node.type !== 'slab') ||
        !Array.isArray(node.polygon)
      )
        continue
      const points = node.polygon.filter(
        (point): point is [number, number] =>
          Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number',
      )
      if (points.length < 3) continue
      const shape = new THREE.Shape()
      shape.moveTo(points[0][0], points[0][1])
      points.slice(1).forEach((point) => {
        shape.lineTo(point[0], point[1])
      })
      shape.closePath()
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), zoneMaterial)
      mesh.rotation.x = Math.PI / 2
      mesh.position.y = elevationFor(node) + 0.015
      mesh.userData.nodeId = String(node.id)
      group.add(mesh)
      meshById.set(String(node.id), mesh)
    }
    scene.add(group)
    if (!group.children.length) {
      renderer.dispose()
      wallMaterial.dispose()
      doorMaterial.dispose()
      windowMaterial.dispose()
      zoneMaterial.dispose()
      host.replaceChildren()
      return
    }

    const bounds = new THREE.Box3().setFromObject(group)
    const center = bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1)
    const axes = new THREE.AxesHelper(Math.max(radius * 0.35, 0.5))
    axes.position.copy(bounds.min)
    scene.add(axes)
    const homePosition = center.clone().add(new THREE.Vector3(radius * 1.35, radius, radius * 1.35))
    camera.near = Math.max(radius / 1000, 0.01)
    camera.far = Math.max(radius * 100, 100)
    camera.position.copy(homePosition)
    camera.updateProjectionMatrix()

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.screenSpacePanning = true
    controls.update()
    resetRef.current = () => {
      camera.position.copy(homePosition)
      controls.target.copy(center)
      controls.update()
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let selectionBox: THREE.BoxHelper | null = null
    const showSelection = (id: string | null | undefined) => {
      selectionBox?.removeFromParent()
      selectionBox?.geometry.dispose()
      selectionBox?.material.dispose()
      selectionBox = null
      const object = id ? meshById.get(id) : undefined
      if (!object) return
      selectionBox = new THREE.BoxHelper(object, '#f6f6f6')
      scene.add(selectionBox)
    }
    showSelection(selectedNodeId)
    const selectObject = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(group.children, false)[0]?.object
      const id = typeof hit?.userData.nodeId === 'string' ? hit.userData.nodeId : null
      showSelection(id)
      onSelectedNodeChange?.(id)
    }
    renderer.domElement.addEventListener('pointerup', selectObject)

    scene.add(new THREE.HemisphereLight('#f6f6f6', '#232323', 1.8))
    const sun = new THREE.DirectionalLight('#f6f6f6', 2.8)
    sun.position.copy(center).add(new THREE.Vector3(radius * 2, radius * 3, radius * 1.5))
    scene.add(sun)
    const grid = new THREE.GridHelper(Math.max(radius * 5, 10), 20, '#2c2c2c', '#1c1c1c')
    grid.position.y = bounds.min.y
    scene.add(grid)

    let frame = 0
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    render()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      renderer.domElement.removeEventListener('pointerup', selectObject)
      selectionBox?.geometry.dispose()
      selectionBox?.material.dispose()
      renderer.dispose()
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      wallMaterial.dispose()
      doorMaterial.dispose()
      windowMaterial.dispose()
      zoneMaterial.dispose()
      host.replaceChildren()
    }
  }, [nodes, onSelectedNodeChange, selectedNodeId])

  if (!visibleObjectCount) {
    return (
      <div className="empty">
        <div>
          <strong>
            {objectCount ? 'All editable objects are hidden' : 'No inferred objects yet'}
          </strong>
          {objectCount
            ? 'Enable an object in the review list to show it here.'
            : 'Enable walls or review the source layer names.'}
        </div>
      </div>
    )
  }

  return (
    <div className="ifc-model-preview" ref={hostRef}>
      <div className="ifc-model-badge">{objectCount.toLocaleString()} editable objects</div>
      <div className="ifc-axis-legend">
        <span className="axis-x">X</span>
        <span className="axis-y">Y</span>
        <span className="axis-z">Z</span>
      </div>
      <div className="preview-navigation">
        <span>
          <RotateCw size={12} /> Orbit · right-drag pan · wheel zoom
        </span>
        <button type="button" aria-label="Reset 3D view" onClick={() => resetRef.current()}>
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  )
}
