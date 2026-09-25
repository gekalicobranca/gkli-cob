'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PreviewItem = {
  id?: string
  linha?: number | string | null
  valido?: boolean | null
  erros?: unknown
  payload?: unknown
  created_at?: string | null
}

type PreviewLogDownloadButtonProps = {
  importacao: Record<string, any>
  itens: PreviewItem[]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function safeFilePart(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function PreviewLogDownloadButton({ importacao, itens }: PreviewLogDownloadButtonProps) {
  function downloadLog() {
    const resumo = asRecord(importacao.resumo)
    const linhas = itens.map((item) => {
      const payload = asRecord(item.payload)
      const mensagens = asStringArray(item.erros)
      const alertas = mensagens
        .filter((mensagem) => mensagem.startsWith('ALERTA:'))
        .map((mensagem) => mensagem.replace(/^ALERTA:\s*/, ''))
      const errosBloqueantes = mensagens.filter((mensagem) => !mensagem.startsWith('ALERTA:'))

      return {
        linha: item.linha ?? null,
        valido: Boolean(item.valido),
        status_preview: item.valido ? 'valida' : 'bloqueada',
        erros_bloqueantes: errosBloqueantes,
        alertas,
        diagnostico: {
          condominio_cnpj: payload.condominio_cnpj ?? payload.cnpj ?? null,
          condominio_nome: payload.condominio_nome ?? payload.nome ?? null,
          condominio_id: payload.condominio_id ?? null,
          unidade_informada: payload.unidade ?? payload.identificacao ?? null,
          bloco_informado: payload.bloco ?? null,
          unidade_id: payload.unidade_id ?? null,
          unidade_localizada: Boolean(payload.unidade_id),
          periodo_negociado: payload.periodo_negociado ?? null,
          competencias_periodo: payload.competencias_periodo ?? null,
          competencias_sem_cobranca: payload.competencias_sem_cobranca ?? null,
          quantidade_cobrancas_acordo: payload.quantidade_cobrancas_acordo ?? null,
          quantidade_cobrancas_arquivadas_periodo: payload.quantidade_cobrancas_arquivadas_periodo ?? null,
          quantidade_cobrancas_posteriores: payload.quantidade_cobrancas_posteriores ?? null,
          cobrancas_acordo_preview: payload.cobrancas_acordo_preview ?? payload.cobrancas_acordo ?? null,
          cobrancas_arquivadas_periodo_preview: payload.cobrancas_arquivadas_periodo_preview ?? null,
          cobrancas_posteriores_preview: payload.cobrancas_posteriores_preview ?? null,
          cobrancas_conflitantes: payload.cobrancas_conflitantes ?? null,
          somente_historico: Boolean(payload.somente_historico),
          unidade_match_motivo: payload.unidade_match_motivo ?? null,
          acao_sugerida: payload.acao_sugerida ?? null,
          score_estimado: payload.score_estimado ?? null,
        },
        payload_completo: payload,
      }
    })

    const bloqueadas = linhas.filter((linha) => !linha.valido)
    const validas = linhas.filter((linha) => linha.valido)
    const unidadesNaoEncontradas = linhas.filter((linha) => !linha.diagnostico.unidade_localizada)
    const semCobrancasPeriodo = linhas.filter((linha) => Number(linha.diagnostico.quantidade_cobrancas_acordo ?? 0) === 0)

    const log = {
      versao_log: 2,
      gerado_em: new Date().toISOString(),
      finalidade: 'Diagnostico do preview de importacao. Este arquivo nao confirma nem grava a importacao.',
      importacao: {
        id: importacao.id ?? null,
        tipo: importacao.tipo ?? null,
        arquivo_nome: importacao.arquivo_nome ?? null,
        status: importacao.status ?? null,
        created_at: importacao.created_at ?? null,
        total_linhas: importacao.total_linhas ?? itens.length,
        total_validas: importacao.total_validas ?? validas.length,
        total_invalidas: importacao.total_invalidas ?? bloqueadas.length,
        resumo,
      },
      resumo_diagnostico: {
        linhas_no_log: linhas.length,
        validas: validas.length,
        bloqueadas: bloqueadas.length,
        unidades_nao_encontradas: unidadesNaoEncontradas.length,
        sem_cobrancas_no_periodo: semCobrancasPeriodo.length,
      },
      linhas,
    }

    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const base = safeFilePart(importacao.arquivo_nome) || 'importacao'
    link.href = url
    link.download = `preview-log-${base}-${String(importacao.id ?? '').slice(0, 8) || 'sem-id'}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button type="button" variant="secondary" onClick={downloadLog}>
      <Download size={16} />
      Baixar log do preview
    </Button>
  )
}
