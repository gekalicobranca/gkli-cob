import { daysOverdue } from './preview-rules'

const DEFAULT_INICIO_COBRANCA_DIAS = 30

export type ReguaImportacaoStatus = {
  foraRegua: boolean
  diasAtraso: number
  inicioCobrancaDias: number
  motivo: string | null
}

export function avaliarReguaImportacao(params: {
  vencimento?: string | null
  inicioCobrancaDias?: number | string | null
}): ReguaImportacaoStatus {
  const inicioInformado = Number(params.inicioCobrancaDias)
  const inicioCobrancaDias = Math.max(
    0,
    Number.isFinite(inicioInformado) ? inicioInformado : DEFAULT_INICIO_COBRANCA_DIAS,
  )
  const diasAtraso = daysOverdue(String(params.vencimento ?? ''))
  const foraRegua = Boolean(params.vencimento) && diasAtraso < inicioCobrancaDias
  const atrasoLabel = diasAtraso < 0
    ? `vence em ${Math.abs(diasAtraso)} dia(s)`
    : diasAtraso === 0
      ? 'vence hoje'
      : `está com ${diasAtraso} dia(s) de atraso`

  return {
    foraRegua,
    diasAtraso,
    inicioCobrancaDias,
    motivo: foraRegua
      ? `Vencimento ${atrasoLabel}; régua do condomínio começa em D+${inicioCobrancaDias}.`
      : null,
  }
}
