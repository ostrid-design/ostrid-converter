# Ostrid Converter

An open-source review pipeline that converts architectural CAD, IFC models, PDFs, and plan images into portable, editable Ostrid `GraphComponent` files.

The converter is intentionally a separate application and repository. GPL-licensed DWG parsing stays here; the proprietary Ostrid editor consumes only the neutral JSON artifact and does not import, bundle, or link the DWG parser.

## What works

- DWG inspection through LibreDWG WebAssembly
- ASCII DXF inspection through `dxf-parser`
- IFC spatial/parametric conversion plus complete tessellated-geometry preservation through `web-ifc`
- PDF rendering with one proposed Ostrid level per page and floor-name hints from embedded text
- PNG, JPEG, WebP, GIF, BMP, and AVIF wall-line inference (where the browser can decode the image)
- pannable/zoomable 2D previews plus orbit/pan/zoom controls for inferred and faithful 3D views
- reviewed IFC X/Y/Z quarter-turn orientation correction carried into the exported building component
- IFC product picking with entity type and Express ID inspection
- inferred floors from drawing titles, with selection and renaming
- adjustable units/scale, wall height, and wall thickness
- adjustable inclusion of walls, openings, dimensions, zones, and annotations
- searchable per-object review with 3D selection, rename, visibility, geometry editing, removal, and restore
- adding missing walls, doors, windows, zones, dimensions, and annotations to a selected floor
- self-contained PDF/image bundles that retain each rendered source page as a calibrated Ostrid guide image
- export as `.ostrid-component.json`, or a self-contained `.ostrid-component` bundle for IFC
- private direct-to-Blob uploads on Vercel, immediate source deletion, and 24-hour draft cleanup

Inference is deliberately review-first. Layer naming and CAD conventions vary, so no conversion should be treated as geometrically authoritative without checking the preview and scale. Raster PDF/image conversion currently detects long horizontal and vertical dark lines; angled walls, openings, labels, zones, and furniture require manual reconstruction in the review editor when they cannot be inferred safely. “Supported” means the converter either produces native editable nodes, preserves faithful source geometry/reference pixels, or explains why a damaged or browser-undecodable file could not be read; it does not promise perfect semantic inference from every authoring convention.

CAD furniture blocks are counted during inspection but are not exported yet, because an Ostrid asset-library mapping is required to turn arbitrary block names into valid editable furniture nodes. IFC furniture and other products are retained in the faithful model geometry even when no native Ostrid node exists for their semantic type.

## Run locally

Requires Node 20+ and [Bun](https://bun.sh/).

```bash
bun install
bun run dev
```

Open `http://localhost:3010`. Local DWG/DXF files are posted only to the local process. IFC, PDF, and image processing runs entirely in the browser.

Verification:

```bash
bun run check
bun run check-types
bun test
bun run build
```

## Create the public GitHub repository

This directory is an independent Git repository. Its public remote is
`https://github.com/ostrid-design/ostrid-converter.git`:

```bash
git add .
git commit -m "Initial Ostrid converter"
git remote add origin https://github.com/ostrid-design/ostrid-converter.git
git push -u origin main
```

Do not copy proprietary editor source into this repository. Integration across the boundary remains file based, using GraphComponent JSON or the documented ZIP-based `.ostrid-component` container.

## Deploy to Vercel

1. Import the public `ostrid-converter` GitHub repository as a new Vercel project.
2. Keep the framework preset as Next.js and the root directory as `.`.
3. Create and connect a **private Vercel Blob store**. Vercel supplies `BLOB_READ_WRITE_TOKEN`.
4. Set `NEXT_PUBLIC_BLOB_UPLOADS_ENABLED=true`.
5. Generate a strong random `CRON_SECRET`; Vercel sends it as a bearer token to the cleanup cron.
6. Before public launch, apply Vercel Firewall rate limits to `/api/upload` and `/api/inspect/cad` to control anonymous storage and compute abuse.
7. Deploy. The included `vercel.json` gives CAD inspection a 300-second duration and 2 GB memory.
8. Add `import.ostrid.design` under the Vercel project's Domains settings and point its DNS record to Vercel as instructed there.

The browser uploads CAD directly to private Blob storage because Vercel Functions have a 4.5 MB request-body limit. The inspection function deletes the source after parsing. Draft download links expire after 15 minutes; a daily cron deletes stored drafts older than 24 hours (so final removal can occur on the following daily run).

## Ostrid workflow

1. Convert and review the drawing here.
2. Export `.ostrid-component.json` for drawing conversions or `.ostrid-component` for an IFC conversion with embedded geometry.
3. In Ostrid, open the GraphComponent library and import that file.
4. Place the component into any scene; fresh node IDs are generated on placement.

All supported formats carry a GraphComponent v1 manifest. IFC keeps its storey hierarchy and converts recognized walls, openings, slabs, stairs, roofs, columns, properties, and materials into native Ostrid nodes. In parallel, every product geometry successfully tessellated by `web-ifc` is written to an embedded GLB fallback with IFC type, name, Express ID, color, transform, and storey assignment. If semantic IFC conversion fails but tessellation succeeds, the converter still creates reviewable storey placeholders and exports the faithful model. The hybrid result preserves visual fidelity without pretending every arbitrary BIM product has an equivalent Ostrid parametric type. PDF pages become proposed levels. Raster PDF/image walls are editable, and each rendered source page is embedded as a calibrated Ostrid guide image so it remains available for tracing after import.

The `.ostrid-component` file is a ZIP container with `component.json` and files beneath `assets/`. Ostrid imports the embedded assets into its local asset store and replaces `asset://embedded/...` placeholders before saving the component. No public CDN or licensed conversion service is required. A later Ostrid embed can reuse the same bundle boundary: the converter returns the confirmed bundle to the private parent app, and the parent runs its existing component-bundle importer without exposing proprietary editor code here.

## Licensing boundary

This application is distributed under GPL-3.0-or-later because it incorporates GPL-licensed LibreDWG. Keeping it in a public, separately deployed repository makes that obligation explicit and prevents accidental linking into proprietary editor code. This is an engineering boundary, not legal advice; have counsel review the distribution model before commercial release.

See [NOTICE.md](NOTICE.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).
