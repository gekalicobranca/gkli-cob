import { registrarEventoOperacional } from '../operacional/service'
import { identidadeRecibo, competenciaNormalizada, marcadorConciliavelRecibo } from './identidade-recibo'
import type { CobrancaImportadaConciliacao } from './cobrancas-conciliacao'

/** Atualiza a posição da origem, sem alterar parcelas, composição contratada ou estados. */
export async function atualizarReciboComMarcador(
  db: { from: (table: string) => any }, id: string,
  importada: CobrancaImportadaConciliacao,
  origem: { origem_importacao?: string; conversao_relatorio_id?: string } = {},
) {
  const { data: row, error } = await db.from('cobrancas')
    .select('id,carteira_id,condominio_id,unidade_id,competencia,vencimento,valor_original,valor_atualizado,juros,multa,correcao,observacoes,status,status_operacional,status_financeiro,updated_at')
    .eq('id', id).is('arquivada_em', null).is('duplicada_de_id', null).is('duplicada_origem_excluida_id', null).maybeSingle()
  if (error) throw new Error('Erro ao conferir recibo com marcador: ' + error.message)
  const recebida = identidadeRecibo(importada)
  const existente = row && identidadeRecibo(row)
  const marcador = recebida && existente && marcadorConciliavelRecibo(recebida.marcador, existente.marcador)
  const valor = Number(importada.valor_atualizado ?? importada.valor_original)
  const original = Number(importada.valor_original ?? importada.valor_atualizado)
  if (!row || !recebida || !existente || recebida.recibo !== existente.recibo
    || !marcador
    || row.carteira_id !== importada.carteira_id || row.condominio_id !== importada.condominio_id
    || row.unidade_id !== importada.unidade_id || row.vencimento !== importada.vencimento
    || (row.competencia && importada.competencia && competenciaNormalizada(row.competencia) !== competenciaNormalizada(importada.competencia))
    || !Number.isFinite(valor) || !Number.isFinite(original) || valor < 0 || original < 0
    || Math.round(original * 100) !== Math.round(Number(row.valor_original ?? row.valor_atualizado) * 100)
    || [row.status_financeiro, row.status_operacional].some(s => ['quitado', 'pago', 'cancelado', 'baixado'].includes(String(s).toLowerCase()))
    || !row.updated_at) throw new Error('Recibo com marcador alterado ou sem correspondência segura; revise a importação.')

  // Conserva as observações históricas; normaliza somente o identificador conhecido.
  const observacoes = row.observacoes.replace(/\brecibo(?:\s*:\s*|\s+)(?:(?:AE|J)\s+)?[a-z0-9][a-z0-9._/-]*(?=\s|\||$)/i, `Recibo ${marcador} ${existente.recibo}`)
  const depois = { valor_atualizado: valor, competencia: row.competencia || importada.competencia || null, observacoes }
  const antes = { valor_atualizado: row.valor_atualizado, competencia: row.competencia, observacoes: row.observacoes }
  for (const campo of ['juros', 'multa', 'correcao'] as const) {
    if (importada[campo] == null || importada[campo] === '') continue
    const numero = Number(importada[campo])
    if (!Number.isFinite(numero) || numero < 0) throw new Error('Encargos inválidos no recibo com marcador.')
    Object.assign(antes, { [campo]: row[campo] })
    Object.assign(depois, { [campo]: numero })
  }
  if (Object.entries(depois).every(([campo, value]) => typeof value === 'number'
    ? row[campo] != null && Number(row[campo]) === value : row[campo] === value)) return false
  const { data: changed, error: updateError } = await db.from('cobrancas').update(depois)
    .eq('id', id).eq('carteira_id', row.carteira_id).eq('updated_at', row.updated_at)
    .is('arquivada_em', null).is('duplicada_de_id', null).is('duplicada_origem_excluida_id', null).select('id')
  if (updateError || changed?.length !== 1) throw new Error('Cobrança alterada durante atualização do recibo com marcador; reavalie a importação.')
  await registrarEventoOperacional(db as any, {
    carteiraId: row.carteira_id, entidadeTipo: 'cobranca', entidadeId: id,
    eventoCodigo: `cobranca.recibo_${marcador.toLowerCase()}_importacao`, titulo: `Atualização de recibo ${marcador} pela importação`,
    descricao: 'Posição da origem atualizada, preservando estados, histórico e vínculos com acordos.',
    antes, depois, payload: origem, origem: 'importacao', auditavel: true, required: true,
  })
  return true
}
