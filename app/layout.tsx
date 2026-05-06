import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'gkli-cob',
  description: 'gkli-cob — plataforma operacional de cobrança extrajudicial condominial',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
