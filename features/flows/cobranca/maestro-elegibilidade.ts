import { diasDesdeVencimento } from '@/features/regua/engine'
import { cobrancaArquivada } from '@/lib/core/cobranca-arquivamento'

export function motivoExclusaoMaestro(row: any, inicio: number, acordo: boolean) {
  if (cobrancaArquivada(row)) return 'Cobrança arquivada por duplicidade'
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

type PendenciaMaestro = { cobranca_id: string; motivo: string; saneamento?: boolean }

export function classificarPendenciasMaestro(registros: PendenciaMaestro[]) {
  const pendencias: PendenciaMaestro[] = []
  const vinculadas: PendenciaMaestro[] = []
  const excluidas: PendenciaMaestro[] = []
  for (const registro of registros) {
    if (['Responsável não cadastrado', 'E-mail ausente ou inválido'].includes(registro.motivo)) {
      pendencias.push(registro)
    } else if (['Já vinculada a outro Flow', 'Já vinculada a outro Flow de e-mail'].includes(registro.motivo)) {
      vinculadas.push(registro)
    } else {
      excluidas.push(registro)
    }
  }
  return { pendencias, vinculadas, excluidas }
}
