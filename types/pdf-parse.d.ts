declare module "pdf-parse/lib/pdf-parse.js" {
  export type PdfParseResult = {
    numpages?: number
    numrender?: number
    info?: Record<string, unknown>
    metadata?: Record<string, unknown> | null
    text?: string
    version?: string
  }

  export default function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>
}
