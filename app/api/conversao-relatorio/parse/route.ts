import { NextRequest, NextResponse } from "next/server"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"
import { requireAuthenticatedApiUser } from "@/app/api/_lib/auth"

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

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const condominioCnpj = String(formData.get("condominio_cnpj") ?? "")
      .replace(/\D/g, "")
      .trim()

    const result = parseRelatorioBuffer({
      buffer,
      filename: file.name,
      mimeType: file.type,
      condominioCnpj,
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
