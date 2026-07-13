import { siteDescription, siteName, siteUrl } from '../site'

export function GET() {
  const body = `# ${siteName}

> ${siteDescription}

## What it does

${siteName} is a review-first web application for turning architectural drawings and building models into portable, editable Ostrid GraphComponents. Users inspect the source before export and can correct detected floors, scale, orientation, geometry, and object mappings.

## Supported sources

- DWG and DXF drawings
- IFC building models
- PDF plans
- PNG, JPEG, WebP, GIF, BMP, and AVIF plan images

## Key capabilities

- 2D source inspection and inferred 3D review
- Floor detection, selection, and renaming
- Scale calibration and IFC orientation correction
- Editable walls, openings, dimensions, zones, annotations, and items
- Faithful IFC geometry fallback when native conversion is incomplete
- Export to .ostrid-component or .ostrid-component.json

## Important context

The converter makes inference visible and reversible. Support for a source format does not imply perfectly automatic semantic conversion; users should review the detected geometry and mappings before export.

## Links

- Website: ${siteUrl}
- Source repository: https://github.com/ostrid-design/ostrid-converter
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
