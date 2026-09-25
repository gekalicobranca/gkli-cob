import { NextRequest, NextResponse } from "next/server"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"
import { requireAuthenticatedApiUser } from "@/app/api/_lib/auth"
import { decodeConversionUpload } from "@/features/conversao-relatorio/server/decode-upload"
import { MAX_SERVER_UPLOAD_BYTES } from "@/features/conversao-relatorio/upload-limits"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireAuthenticatedApiUser()
    if (response) return response

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Arquivo não enviado." },
        { status: 400 }
      )
    }

    if (file.size > MAX_SERVER_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Arquivo enviado excede 4 MB. Atualize a página para usar a compactação automática." }, { status: 413 })
    }
    const encoding = String(formData.get("file_encoding") ?? "")
    let buffer: Buffer
    try {
      buffer = decodeConversionUpload(Buffer.from(await file.arrayBuffer()), encoding)
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Arquivo inválido." }, { status: 400 })
    }
    const condominioCnpj = String(formData.get("condominio_cnpj") ?? "")
      .replace(/\D/g, "")
      .trim()
    const tipoConversao = String(formData.get("tipo_conversao") ?? "cobrancas") === "unidades" ? "unidades" : "cobrancas"

    const result = await parseRelatorioBuffer({
      buffer,
      filename: file.name,
      mimeType: encoding ? String(formData.get("original_mime_type") ?? "") : file.type,
      condominioCnpj,
      tipoConversao,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Erro ao converter relatório:", error)

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao converter relatório.",
      },
      { status: 500 }
    )
  }
}
