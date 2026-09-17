import { diasDesdeVencimento } from '@/features/regua/engine'

export function motivoExclusaoMaestro(row: any, inicio: number, acordo: boolean) {
  if (row.automacao_bloqueada) return 'Automação bloqueada'
  if (acordo) return 'Acordo vigente'
  if (!['novo', 'em_cobranca_ativa'].includes(row.status_operacional) || ['possivel_acordo', 'acordo_firmado', 'acordo_efetivado', 'pre_juridico', 'judicializado', 'suspenso'].includes(row.status)) return 'Status fora da cobrança automática'
  if (['quitado', 'renegociado'].includes(row.status_financeiro)) return 'Débito quitado ou renegociado'
  if (diasDesdeVencimento(row.vencimento) < inicio) return `Ainda não atingiu D+${inicio}`
  return null
}

export function motivoSaneamentoMaestro(nome: unknown, email: unknown) {
  if (!String(nome ?? '').trim()) return 'Responsável não cadastrado'
  if (!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(String(email ?? '').trim())) return 'E-mail ausente ou inválido'
  return null
}
