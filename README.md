# Ostrid Converter

Ostrid Converter is an open-source, review-first pipeline for turning architectural drawings and building models into portable Ostrid `GraphComponent` files.

It accepts DWG, DXF, IFC, PDF, and common plan-image formats. The converter proposes floors and editable building objects, lets the user inspect and correct the result in 2D and 3D, and exports a self-contained component that can be imported into an Ostrid scene.

## Why this project exists

Architectural files rarely share one reliable structure. CAD meaning is often encoded in layer names, IFC authoring conventions vary between tools, and raster plans contain pixels rather than building objects. A fully automatic import can therefore look convincing while being geometrically or semantically wrong.

Ostrid Converter makes inference visible and reversible:

1. Read the source without adding anything to a scene.
2. Preserve faithful source geometry or reference imagery where possible.
3. Infer native Ostrid floors and editable objects.
4. Let the user verify scale, orientation, floors, categories, and individual objects.
5. Export only after the reviewed result is confirmed.

## Supported inputs

| Format | Processing | Result |
| --- | --- | --- |
| DWG | LibreDWG WebAssembly on the converter server | Layer-aware CAD inspection and native object inference |
| DXF | `dxf-parser` on the converter server | Layer-aware CAD inspection and native object inference |
| IFC | `web-ifc` in the browser | Native semantic nodes plus a faithful tessellated GLB fallback |
| PDF | PDF.js in the browser | Proposed level per page, inferred wall lines, and embedded guide images |
| Images | Browser image decoding | Inferred wall lines and an embedded guide image |

PNG, JPEG, WebP, GIF, BMP, and AVIF are accepted when the browser can decode them.

Support means the converter can produce editable nodes, preserve faithful source geometry/reference pixels, or return a clear read error. It does not imply perfect semantic inference from every file or authoring convention.

## Review and editing

The review workspace provides:

- pannable and zoomable 2D source inspection;
- orbit, pan, zoom, and picking in 3D;
- floor detection, selection, and renaming;
- scale calibration from a known drawing distance;
- X/Y/Z orientation correction for IFC models;
- category controls for walls, openings, dimensions, zones, annotations, and items;
- a searchable object list with rename, visibility, removal, and restore;
- geometry fields for basic position, size, wall thickness, and wall height changes;
- tools for adding missing walls, doors, windows, zones, dimensions, and annotations.

IFC semantic conversion and faithful tessellation run independently. If an unusual IFC cannot be mapped into native Ostrid objects but its geometry can be tessellated, the model can still be reviewed and exported with storey placeholders. Individual IFC products can be removed from both representations during review.

Raster inference currently focuses on long horizontal and vertical wall lines. Angled walls, openings, labels, zones, and furniture may need manual reconstruction. The original rendered PDF pages or source image remain embedded as calibrated Ostrid guide images for tracing.

## Output format

Every export contains a GraphComponent v1 manifest.

- `.ostrid-component.json` is a plain JSON component with no embedded binary assets.
- `.ostrid-component` is a ZIP container with `component.json` and files under `assets/`.

Embedded files are referenced with `asset://embedded/...` placeholders. A consuming application stores those files in its own asset store, rewrites the placeholders, validates the manifest, and then saves or places the component. This keeps the converter independent from any particular editor deployment or storage backend.

## Run locally

Requirements:

- Node.js 20 or newer
- [Bun](https://bun.sh/)

```bash
bun install
bun run dev
```

Open `http://localhost:3010`.

IFC, PDF, and image processing stays in the browser. In local development, DWG and DXF files are sent only to the local Next.js process.

Run the verification suite with:

```bash
bun run check
bun run check-types
bun test
bun run build
```

## Deployment

The repository is a standard Next.js application and can be deployed on any platform that supports its Node.js API routes and WebAssembly assets.

For Vercel deployments:

1. Import this repository as a Next.js project.
2. Keep the repository root as the project root.
3. Connect a private Vercel Blob store. New connections use Vercel's short-lived OIDC
   authentication automatically; legacy connections may expose a `BLOB_READ_WRITE_TOKEN`.
4. Set `NEXT_PUBLIC_BLOB_UPLOADS_ENABLED=true` to enable direct uploads for CAD files that exceed the function request-body limit.
5. Set a strong `CRON_SECRET` for the scheduled cleanup endpoint.
6. Apply suitable firewall and rate limits to `/api/upload` and `/api/inspect/cad` before exposing a public deployment.

The included `vercel.json` configures the CAD inspection function and daily cleanup job. Hosted CAD sources are deleted immediately after parsing when possible. Private draft links expire after 15 minutes, and scheduled cleanup removes remaining drafts.

Blob storage is optional for local development and for hosts that accept the required request sizes directly.

## Integration

The simplest integration is file based:

1. Convert and review a source file.
2. Export the `.ostrid-component` or `.ostrid-component.json` artifact.
3. Import the artifact into a GraphComponent-compatible application.
4. Place the component into a scene with freshly generated node IDs.

An embedded integration can use the same artifact boundary. The converter can run in an isolated frame or window and return the confirmed component bundle to its parent. The parent remains responsible for origin checks, manifest validation, asset storage, and scene placement.

## Project boundary and licensing

Ostrid Converter is intentionally maintained as a standalone public application. It does not contain the Ostrid editor, scene services, authentication, or proprietary application code.

This repository is licensed under GPL-3.0-or-later because DWG support uses LibreDWG. Other major dependencies retain their own licenses, including `web-ifc` under MPL-2.0 and Three.js, `fflate`, and the adapted Pascal IFC conversion code under MIT terms. See [NOTICE.md](NOTICE.md) for attribution.

Applications consuming exported GraphComponent artifacts do not need to import or bundle the converter implementation. Keeping communication at the documented data/artifact boundary also makes it possible to replace or independently deploy either side.

This description explains the intended engineering boundary and is not legal advice. Distributors should review the applicable licenses for their own deployment and distribution model.

## Contributing and security

Bug reports and focused improvements are welcome. Conversion changes should include representative fixtures or tests whenever licensing and file size permit, and should preserve the review-first behavior rather than silently guessing.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance and [SECURITY.md](SECURITY.md) for reporting security issues.
