import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Sora, Space_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'
import { siteDescription, siteName, siteUrl } from './site'

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'Ostrid Converter | Review Architectural Files Before Export',
    template: '%s | Ostrid Converter',
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    'DWG converter',
    'DXF converter',
    'IFC converter',
    'architectural drawing converter',
    'CAD to editable components',
    'building model review',
    'Ostrid GraphComponents',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName,
    title: 'Ostrid Converter | Review Architectural Files Before Export',
    description: siteDescription,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Ostrid Converter workspace for reviewing architectural drawings and building models',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ostrid Converter | Review Architectural Files Before Export',
    description: siteDescription,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#0f0f0f',
  colorScheme: 'dark',
}

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const uiFont = Sora({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
})

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${displayFont.variable} ${uiFont.variable} ${monoFont.variable}`} lang="en">
      <body>{children}</body>
    </html>
  )
}
