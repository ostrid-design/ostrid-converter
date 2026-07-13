import { ConverterWorkbench } from '../components/converter-workbench'
import { siteDescription, siteName, siteUrl } from './site'

export default function Home() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}#application`,
    name: siteName,
    description: siteDescription,
    url: siteUrl.toString(),
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    featureList: [
      'Review DWG and DXF drawings before export',
      'Inspect IFC models with editable and faithful geometry options',
      'Import PDF and plan-image sources for calibrated review',
      'Export portable Ostrid GraphComponents',
    ],
  }
  const structuredDataJson = JSON.stringify(structuredData).replace(/</g, '\\u003c')

  return (
    <>
      <script type="application/ld+json">{structuredDataJson}</script>
      <ConverterWorkbench />
    </>
  )
}
