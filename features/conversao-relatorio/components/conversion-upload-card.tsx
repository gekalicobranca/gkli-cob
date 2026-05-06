"use client"

import { useMemo, useState } from "react"
import type { ConversaoPreview } from "../server/parse-relatorio-buffer"

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

export function ConversionUploadCard() {
  const [preview, setPreview] = useState<ConversaoPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const topCobrancas = useMemo(() => {
    return [...(preview?.cobrancas ?? [])]
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 10)
  }, [preview])

  async function handleFile(file: File | null) {
    setError(null)
    setPreview(null)
    setFilename(file?.name ?? null)

    if (!file) return

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/conversao-relatorio/parse", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setError(result.error ?? "Não foi possível processar o relatório.")
        return
      }

      setPreview(result.preview)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao processar o relatório."
      )
    } finally {
      setLoading(false)
    }
  }

  const csvFilename =
    filename?.replace(/\.[^.]+$/, "")?.concat("_gkli_cobrancas.csv") ??
    "gkli_cobrancas_convertidas.csv"

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
          Nova conversão
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Subir relatório</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A Conversão de Relatório transforma o arquivo da administradora em CSV padrão GKLI,
          pronto para o módulo de Importações. Ela não altera cadastro, não cria unidade e não
          grava cobranças diretamente.
        </p>
      </div>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:bg-slate-100">
        <input
          type="file"
          accept=".xls,.xlsx,.html,.htm,.csv"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-semibold text-slate-950">
          {loading ? "Processando relatório..." : "Clique para selecionar o relatório"}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          XLS antigo, XLSX, CSV ou HTML exportado por administradora
        </span>
      </label>

      {filename ? (
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Arquivo selecionado: <strong className="text-slate-950">{filename}</strong>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Origem</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{preview.origem}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Cobranças</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{preview.cobrancas.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Parcelas</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{preview.totalParcelas}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Total</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(preview.valorTotal)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  CSV padrão GKLI pronto
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Baixe o arquivo e importe no módulo de Importações/Cobranças.
                </p>
              </div>

              <button
                type="button"
                onClick={() => downloadCsv(csvFilename, preview.csv)}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Baixar CSV GKLI
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3 text-right">Parcelas origem</th>
                  <th className="px-4 py-3 text-right">Valor consolidado</th>
                  <th className="px-4 py-3">Vencimento base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topCobrancas.map((cobranca) => (
                  <tr key={cobranca.unidade}>
                    <td className="px-4 py-3 font-semibold text-slate-950">{cobranca.unidade}</td>
                    <td className="px-4 py-3 text-slate-600">{cobranca.responsavel}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{cobranca.parcelas.length}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatCurrency(cobranca.valorTotal)}</td>
                    <td className="px-4 py-3 text-slate-600">{cobranca.vencimentoMaisAntigo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Conversão consolidada: 1 linha no CSV por unidade. Os vencimentos originais ficam
            preservados em observações, e o vencimento base é o mais antigo identificado.
          </div>
        </div>
      ) : null}
    </section>
  )
}
