declare module "pdf-parse/lib/pdf-parse.js" {
  export type PdfParseResult = {
    text?: string
    numpages?: number
    numrender?: number
    info?: unknown
    metadata?: unknown
    version?: string
  }

  export default function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>
}

declare module "pdf-parse" {
  export type PdfParseResult = {
    text?: string
    total?: number
    pages?: unknown[]
  }

  export class PDFParse {
    constructor(options: { data: Buffer })
    getText(): Promise<PdfParseResult>
    destroy?(): Promise<void> | void
  }

  const pdfParse: ((dataBuffer: Buffer) => Promise<PdfParseResult>) | undefined
  export default pdfParse
}
