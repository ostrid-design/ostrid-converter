import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules/web-ifc/web-ifc.wasm')
const destination = join(root, 'public/web-ifc.wasm')

await mkdir(dirname(destination), { recursive: true })
await copyFile(source, destination)
