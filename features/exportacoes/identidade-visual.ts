import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'

export const IDENTIDADE_GKLI = {
  primary: '03658C', dark: '024F6F', accent: '3B2049',
  background: 'F8FAFC', border: 'E5E7EB', text: '0F172A', muted: '475569', soft: 'E6F1F5',
  tagline: 'Cobrança inteligente',
} as const

let logo: Buffer | undefined
export function logoRelatoriosGkli() {
  return logo ??= readFileSync(path.join(process.cwd(), 'public/logo-gkli-menu-icon.png'))
}

/** The report layout reserves the cover brand line and the 40 pt page header. */
export async function aplicarIdentidadePdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const image = await doc.embedPng(logoRelatoriosGkli())
  const accent = IDENTIDADE_GKLI.accent
  const color = rgb(parseInt(accent.slice(0, 2), 16) / 255, parseInt(accent.slice(2, 4), 16) / 255, parseInt(accent.slice(4, 6), 16) / 255)
  doc.getPages().forEach((page, index) => {
    const { height, width } = page.getSize()
    const size = index === 0 ? 36 : 22
    page.drawImage(image, { x: 42, y: height - (index === 0 ? 88 : 31), width: size, height: size })
    page.drawRectangle({ x: 0, y: height - (index === 0 ? 332 : 42), width, height: 2, color })
  })
  doc.setProducer('GKLI Cobrança')
  doc.setCreator('GKLI Cobrança')
  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
