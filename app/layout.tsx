import type { Metadata } from 'next'
import { JetBrains_Mono, Sora, Space_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ostrid Converter',
  description: 'Review architectural CAD and export editable Ostrid GraphComponents.',
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
