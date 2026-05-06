import { NextRequest, NextResponse } from "next/server"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Arquivo não enviado." },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = parseRelatorioBuffer({
      buffer,
      filename: file.name,
      mimeType: file.type,
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
