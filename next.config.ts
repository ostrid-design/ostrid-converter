import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    '/api/inspect/cad': ['./node_modules/@mlightcad/libredwg-web/wasm/**/*'],
  },
  poweredByHeader: false,
}

export default nextConfig
