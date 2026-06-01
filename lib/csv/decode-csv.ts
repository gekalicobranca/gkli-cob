export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const cleanBuffer = hasBom ? bytes.slice(3) : bytes

  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(cleanBuffer)

  if (!hasEncodingProblems(utf8Text)) {
    return normalizeCsvText(utf8Text)
  }

  const windows1252Text = new TextDecoder('windows-1252', { fatal: false }).decode(cleanBuffer)
  return normalizeCsvText(windows1252Text)
}

export function normalizeCsvText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
}

function hasEncodingProblems(text: string): boolean {
  return (
    text.includes('�') ||
    text.includes('Ã') ||
    text.includes('Â') ||
    text.includes('â€') ||
    text.includes('â€“') ||
    text.includes('â€œ') ||
    text.includes('â€')
  )
}

export function withUtf8Bom(content: string): string {
  return `\uFEFF${content}`
}
