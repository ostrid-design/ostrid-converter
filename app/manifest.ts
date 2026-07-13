import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ostrid Converter',
    short_name: 'Ostrid Convert',
    description: 'Review architectural files and export editable Ostrid GraphComponents.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0f0f',
    theme_color: '#0f0f0f',
  }
}
