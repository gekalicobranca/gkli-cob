import type { Metadata } from 'next'
import { AppInteractionIndicator } from '@/components/feedback/app-interaction-indicator'
import './globals.css'

export const metadata: Metadata = {
  title: 'GKLI Cobrança',
  description: 'GKLI Cobrança — plataforma operacional de cobrança extrajudicial condominial',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppInteractionIndicator />
        {children}
      </body>
    </html>
  )
}
