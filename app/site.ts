const fallbackSiteUrl = 'https://ostrid-converter.vercel.app'

function toAbsoluteUrl(value: string | undefined) {
  if (!value) return undefined

  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`)
  } catch {
    return undefined
  }
}

export const siteUrl =
  toAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  toAbsoluteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  toAbsoluteUrl(process.env.VERCEL_URL) ??
  new URL(fallbackSiteUrl)

export const siteName = 'Ostrid Converter'
export const siteDescription =
  'Convert DWG, DXF, IFC, PDF, and plan images into reviewed, editable Ostrid GraphComponents.'
