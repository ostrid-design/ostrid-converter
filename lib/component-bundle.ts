import { strToU8, zipSync } from 'fflate'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { GraphComponent } from './graph-component'
import type { IfcMeshModel } from './ifc-mesh'

export async function exportIfcModelGlb(model: IfcMeshModel): Promise<Uint8Array> {
  const scene = new THREE.Scene()
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  for (const primitive of model.primitives) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(primitive.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(primitive.normals, 3))
    geometry.setIndex(new THREE.BufferAttribute(primitive.indices, 1))
    const colorKey = primitive.color.map((value) => value.toFixed(4)).join(':')
    let material = materials.get(colorKey)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        name: `IFC material ${materials.size + 1}`,
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
    mesh.userData = {
      ifcExpressId: primitive.expressId,
      ifcType: primitive.ifcType,
      sourceName: primitive.name,
    }
    scene.add(mesh)
  }
  const result = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  })
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose()
  })
  materials.forEach((material) => {
    material.dispose()
  })
  if (!(result instanceof ArrayBuffer)) throw new Error('GLB export returned an unexpected result.')
  return new Uint8Array(result)
}

export function createComponentBundle(
  component: GraphComponent,
  assets: Uint8Array | Record<string, Uint8Array>,
): Uint8Array {
  const files =
    assets instanceof Uint8Array
      ? { 'assets/ifc-model.glb': assets }
      : Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [`assets/${name}`, bytes]))
  return zipSync(
    {
      'component.json': strToU8(JSON.stringify(component, null, 2)),
      ...files,
    },
    { level: 6 },
  )
}
