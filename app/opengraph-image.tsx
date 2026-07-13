import { ImageResponse } from 'next/og'

export const alt = 'Ostrid Converter architectural file review workspace'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'stretch',
        background:
          'radial-gradient(circle at 8% 4%, rgba(100, 86, 246, 0.46), transparent 32%), radial-gradient(circle at 88% 8%, rgba(31, 201, 192, 0.2), transparent 28%), #0f0f0f',
        color: '#f6f6f6',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '56px',
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          color: '#9f96ff',
          display: 'flex',
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: 7,
          textTransform: 'uppercase',
        }}
      >
        Ostrid Converter
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 68,
          fontWeight: 700,
          letterSpacing: -4,
          lineHeight: 1.02,
          marginTop: 56,
          maxWidth: 890,
        }}
      >
        Turn architectural sources into editable components.
      </div>
      <div
        style={{
          color: '#c6c6cc',
          display: 'flex',
          fontSize: 27,
          lineHeight: 1.45,
          marginTop: 30,
          maxWidth: 860,
        }}
      >
        Review DWG, DXF, IFC, PDF, and plan images before exporting portable Ostrid GraphComponents.
      </div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 16,
          marginTop: 'auto',
        }}
      >
        {['Import', 'Review', 'Export'].map((step, index) => (
          <div
            key={step}
            style={{
              alignItems: 'center',
              background: index === 1 ? '#6456f6' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 999,
              display: 'flex',
              fontSize: 22,
              padding: '12px 20px',
            }}
          >
            {step}
          </div>
        ))}
      </div>
    </div>,
    size,
  )
}
