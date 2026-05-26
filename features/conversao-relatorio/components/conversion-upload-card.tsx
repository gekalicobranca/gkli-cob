"use client"

import { useMemo, useState } from "react"
import type { ConversaoPreview, TipoConversaoRelatorio } from "../server/parse-relatorio-buffer"

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

function downloadXlsx(filename: string, base64: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

type CondominioOption = {
  id: string
  nome: string
  cnpj: string
}

type ConversionUploadCardProps = {
  condominios: CondominioOption[]
}

const tipoOptions: Array<{
  value: TipoConversaoRelatorio
  title: string
  description: string
  accept: string
}> = [
  {
    value: "unidades",
    title: "Unidades",
    description: "PDF de relatório de unidades → XLSX padrão Importações/Unidades.",
    accept: ".pdf",
  },
  {
    value: "cobrancas",
    title: "Cobranças",
    description: "XLS, XLSX, CSV ou HTML de inadimplência → XLSX padrão Importações/Cobranças.",
    accept: ".xls,.xlsx,.html,.htm,.csv",
  },
]

export function ConversionUploadCard({ condominios }: ConversionUploadCardProps) {
  const [preview, setPreview] = useState<ConversaoPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [condominioCnpj, setCondominioCnpj] = useState("")
  const [tipoConversao, setTipoConversao] = useState<TipoConversaoRelatorio>("unidades")

  const selectedTipo = tipoOptions.find((option) => option.value === tipoConversao) ?? tipoOptions[0]

  const topCobrancas = useMemo(() => {
    return [...(preview?.cobrancas ?? [])]
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 10)
  }, [preview])

  const topUnidades = useMemo(() => {
    return [...(preview?.unidades ?? [])].slice(0, 20)
  }, [preview])

  async function handleFile(file: File | null) {
    setError(null)
    setPreview(null)
    setFilename(file?.name ?? null)

    if (!file) return

    if (tipoConversao === "unidades" && !condominioCnpj) {
      setError("Selecione o condomínio antes de converter unidades. O XLSX precisa sair com condominio_cnpj.")
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("tipo_conversao", tipoConversao)
      if (condominioCnpj) formData.append("condominio_cnpj", condominioCnpj)

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

  const outputSuffix = tipoConversao === "unidades" ? "unidades" : "cobrancas"
  const outputBaseName =
    filename?.replace(/\.[^.]+$/, "")?.concat(`_gkli_${outputSuffix}`) ??
    `gkli_${outputSuffix}_convertidas`

  const csvFilename = `${outputBaseName}.csv`
  const xlsxFilename = `${outputBaseName}.xlsx`

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
          Nova conversão
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Subir relatório</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Selecione o tipo de conversão antes do upload. O motor reconhece automaticamente o padrão ativo da administradora/sistema e gera o XLSX no modelo oficial: Unidades ou Cobranças.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {tipoOptions.map((option) => {
          const active = tipoConversao === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setTipoConversao(option.value)
                setPreview(null)
                setError(null)
                setFilename(null)
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              <span className="text-sm font-semibold">{option.title}</span>
              <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/75" : "text-slate-500"}`}>
                {option.description}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Condomínio da importação
        </label>
        <select
          value={condominioCnpj}
          onChange={(event) => setCondominioCnpj(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
        >
          <option value="">
            {tipoConversao === "unidades"
              ? "Selecione o condomínio para converter unidades"
              : "Não preencher CNPJ no arquivo convertido"}
          </option>
          {condominios.map((condominio) => (
            <option key={condominio.id} value={condominio.cnpj}>
              {condominio.nome} · {condominio.cnpj}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Em Unidades, o condomínio é obrigatório para preencher condominio_cnpj no XLSX. O nome detectado no PDF ajuda na conferência, mas a origem técnica do layout é a administradora/sistema.
        </p>
      </div>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:bg-slate-100">
        <input
          type="file"
          accept={selectedTipo.accept}
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-semibold text-slate-950">
          {loading ? "Processando relatório..." : `Clique para selecionar o arquivo de ${selectedTipo.title.toLowerCase()}`}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          {selectedTipo.description}
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
          {preview.padraoDetectado ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                    Padrão reconhecido automaticamente
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-emerald-950">
                    {preview.padraoDetectado.nome}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    Fornecedor: {preview.padraoDetectado.fornecedor} · Sistema: {preview.padraoDetectado.sistema} · Relatório: {preview.padraoDetectado.relatorio}
                  </p>
                  {preview.padraoDetectado.condominioDetectado ? (
                    <p className="mt-1 text-xs leading-5 text-emerald-800">
                      Condomínio detectado no arquivo: <strong>{preview.padraoDetectado.condominioDetectado}</strong>
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm">
                  Confiança {preview.padraoDetectado.confianca}%
                </span>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Origem</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{preview.origem}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {preview.tipoConversao === "unidades" ? "Unidades" : "Cobranças"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {preview.tipoConversao === "unidades" ? preview.unidades.length : preview.cobrancas.length}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Registros</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{preview.totalParcelas}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {preview.tipoConversao === "unidades" ? "Destino" : "Total"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {preview.tipoConversao === "unidades" ? "Importações/Unidades" : formatCurrency(preview.valorTotal)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  XLSX padrão GKLI pronto
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Baixe o XLSX e importe no módulo oficial de {preview.tipoConversao === "unidades" ? "Importações/Unidades" : "Importações/Cobranças"}.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadXlsx(xlsxFilename, preview.xlsxBase64)}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Baixar XLSX GKLI
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv(csvFilename, preview.csv)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Baixar CSV auxiliar
                </button>
              </div>
            </div>
          </div>

          {preview.tipoConversao === "unidades" ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topUnidades.map((unidade) => (
                    <tr key={unidade.identificacao}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{unidade.identificacao}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.tipo}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.responsavelNome}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.responsavelDocumento || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.telefone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{unidade.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Bloco</th>
                    <th className="px-4 py-3">Unidade</th>
                    <th className="px-4 py-3">Recibo</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3 text-right">Principal</th>
                    <th className="px-4 py-3 text-right">Multa</th>
                    <th className="px-4 py-3 text-right">Correção</th>
                    <th className="px-4 py-3 text-right">Juros</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topCobrancas.map((cobranca, index) => (
                    <tr key={`${cobranca.recibo ?? cobranca.unidade}-${index}`}>
                      <td className="px-4 py-3 text-slate-600">{cobranca.bloco || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-950">{cobranca.unidade}</td>
                      <td className="px-4 py-3 text-slate-600">{cobranca.recibo || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{cobranca.vencimento || cobranca.vencimentoMaisAntigo || "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(cobranca.valorPrincipal ?? cobranca.valorTotal)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(cobranca.multa ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(cobranca.correcao ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(cobranca.juros ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatCurrency(cobranca.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {preview.tipoConversao === "unidades"
              ? "Conversão de unidades: o XLSX gera uma linha por unidade e prioriza o proprietário como responsável principal. Inquilinos e vínculos extras ficam documentados em observações."
              : "Conversão por recibo: no padrão Condopro/BBZ, 1 recibo = 1 vencimento = 1 cobrança. Itens como água, gás, fundo e condomínio ficam apenas na administradora."}
          </div>
        </div>
      ) : null}
    </section>
  )
}
