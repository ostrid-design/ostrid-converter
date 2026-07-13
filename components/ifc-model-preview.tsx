'use client'

import { Maximize2, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { IfcMeshModel } from '../lib/ifc-mesh'

export type IfcProductSelection = {
  expressId: number
  ifcType: string
  name: string
}

export function IfcModelPreview({
  model,
  orientationDegrees = { x: 0, y: 0, z: 0 },
  onSelectionChange,
}: {
  model: IfcMeshModel
  orientationDegrees?: { x: number; y: number; z: number }
  onSelectionChange?: (selection: IfcProductSelection | null) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => undefined)
  const [selection, setSelection] = useState<{
    expressId: number
    ifcType: string
    name: string
  } | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f2f4f7')
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const group = new THREE.Group()
    const materials = new Map<string, THREE.MeshStandardMaterial>()
    for (const primitive of model.primitives) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(primitive.positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(primitive.normals, 3))
      geometry.setIndex(new THREE.BufferAttribute(primitive.indices, 1))
      geometry.computeBoundingSphere()
      const colorKey = primitive.color.map((value) => value.toFixed(3)).join(':')
      let material = materials.get(colorKey)
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(primitive.color[0], primitive.color[1], primitive.color[2]),
          opacity: primitive.color[3],
          transparent: primitive.color[3] < 0.99,
          roughness: 0.72,
          metalness: 0.02,
          side: THREE.DoubleSide,
        })
        materials.set(colorKey, material)
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `${primitive.ifcType} ${primitive.expressId}: ${primitive.name}`
      mesh.userData = { expressId: primitive.expressId, ifcType: primitive.ifcType }
      group.add(mesh)
    }
    group.rotation.set(
      (orientationDegrees.x * Math.PI) / 180,
      (orientationDegrees.y * Math.PI) / 180,
      (orientationDegrees.z * Math.PI) / 180,
      'XYZ',
    )
    group.updateMatrixWorld(true)
    scene.add(group)

    const bounds = new THREE.Box3().setFromObject(group)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, 0.25)
    const axes = new THREE.AxesHelper(Math.max(radius * 0.35, 0.5))
    axes.position.copy(bounds.min)
    scene.add(axes)
    camera.near = Math.max(radius / 1000, 0.001)
    camera.far = Math.max(radius * 100, 100)
    const homePosition = center.clone().add(new THREE.Vector3(radius * 1.25, radius, radius * 1.25))
    camera.position.copy(homePosition)
    camera.updateProjectionMatrix()

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
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
    const selectProduct = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(group.children, false)[0]?.object
      selectionBox?.removeFromParent()
      selectionBox?.geometry.dispose()
      selectionBox?.material.dispose()
      selectionBox = null
      if (!(hit instanceof THREE.Mesh)) {
        setSelection(null)
        onSelectionChange?.(null)
        return
      }
      selectionBox = new THREE.BoxHelper(hit, '#f97316')
      scene.add(selectionBox)
      const nextSelection = {
        expressId: Number(hit.userData.expressId),
        ifcType: String(hit.userData.ifcType),
        name: hit.name.replace(/^\S+\s+\d+:\s*/, ''),
      }
      setSelection(nextSelection)
      onSelectionChange?.(nextSelection)
    }
    renderer.domElement.addEventListener('pointerup', selectProduct)

    scene.add(new THREE.HemisphereLight('#ffffff', '#8793a1', 2.2))
    const sun = new THREE.DirectionalLight('#fff6e8', 3.5)
    sun.position.copy(center).add(new THREE.Vector3(radius * 2, radius * 3, radius * 1.5))
    scene.add(sun)
    const grid = new THREE.GridHelper(Math.max(radius * 5, 10), 20, '#aeb6c0', '#d6dbe1')
    grid.position.y = model.bounds.min[1]
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
      renderer.domElement.removeEventListener('pointerup', selectProduct)
      selectionBox?.geometry.dispose()
      selectionBox?.material.dispose()
      renderer.dispose()
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      materials.forEach((material) => {
        material.dispose()
      })
      host.replaceChildren()
    }
  }, [model, onSelectionChange, orientationDegrees.x, orientationDegrees.y, orientationDegrees.z])

  return (
    <div className="ifc-model-preview" ref={hostRef}>
      <div className="ifc-model-badge">
        {model.elementCount.toLocaleString()} products · {model.triangleCount.toLocaleString()}{' '}
        triangles
      </div>
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
      {selection && (
        <div className="ifc-model-selection">
          <strong>{selection.name}</strong>
          <span>
            {selection.ifcType} · #{selection.expressId}
          </span>
        </div>
      )}
    </div>
  )
}
