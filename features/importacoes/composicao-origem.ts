export type TipoCobrancaOrigem = 'cota_condominial' | 'cessao_espaco' | 'multa' | 'consumo' | 'outros'
export type ComponenteCobrancaOrigem = {
  conta: string
  historico: string
  valorPrincipal: number
  valorTotal: number
  tipo: TipoCobrancaOrigem
}
export type ComposicaoCobrancaOrigem = {
  detalhesOrigem?: string
  composicaoOrigem?: ComponenteCobrancaOrigem[]
  tiposCobranca?: TipoCobrancaOrigem[]
}
export const NOMES_TIPOS_COBRANCA: Record<TipoCobrancaOrigem, string> = {
  cota_condominial: 'Cota condominial', cessao_espaco: 'Cessão/locação de espaço',
  multa: 'Multa (lançamento)', consumo: 'Consumo', outros: 'Outros',
}

/** Classifica o histórico do componente; os encargos de atraso não definem o tipo. */
export function tipoCobrancaDoHistorico(historico: string): TipoCobrancaOrigem {
  const text = historico.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (/\b(?:CESSAO|LOCACAO|ALUGUEL)\b.*\b(?:ESPACO|SALAO|AREA)\b/.test(text)) return 'cessao_espaco'
  if (/\bMULTA\b/.test(text)) return 'multa'
  if (/\bCONSUMO\b|\b(?:AGUA|GAS|ENERGIA)\b/.test(text)) return 'consumo'
  if (/\b(?:COTAS?|TAXAS?|TX)\b.*\bCONDOM|\bRATEIO MENSAL\b/.test(text)) return 'cota_condominial'
  return 'outros'
}

export function observacoesComComposicao(atual: string | null | undefined, origem: ComposicaoCobrancaOrigem) {
  if (!origem.detalhesOrigem && !origem.composicaoOrigem?.length) return atual ?? ''
  const base = String(atual ?? '').replace(/^(?:Tipos de cobrança|Composição da origem):[^\n]*(?:\n|$)/gm, '').trim()
  const tipos = [...new Set(origem.composicaoOrigem?.map(i => i.tipo) ?? origem.tiposCobranca ?? [])]
  const detalhes = origem.detalhesOrigem || origem.composicaoOrigem?.map(i => `${i.conta} ${i.historico}: R$ ${i.valorPrincipal.toFixed(2).replace('.', ',')}`).join('; ')
  return [base, tipos.length ? `Tipos de cobrança: ${tipos.map(t => NOMES_TIPOS_COBRANCA[t]).join('; ')}` : '', detalhes ? `Composição da origem: ${detalhes.replace(/\s+/g, ' ')}` : ''].filter(Boolean).join('\n')
}

/** Enriquece somente metadados do débito conciliado e das suas parcelas identificadas. */
export async function persistirComposicaoConciliada(db: { from: (table: string) => any }, id: string,
  contexto: { condominioId: string; carteiraId: string; recibo: string; vencimento: string }, origem: ComposicaoCobrancaOrigem) {
  if (!origem.detalhesOrigem && !origem.composicaoOrigem?.length) return
  const scope = () => db.from('cobrancas').select('id,observacoes').eq('id', id).eq('condominio_id', contexto.condominioId).eq('carteira_id', contexto.carteiraId).is('duplicada_de_id', null)
  const atual = await scope().single()
  if (atual.error) throw atual.error
  const observacoes = observacoesComComposicao(atual.data.observacoes, origem)
  let updateQuery = db.from('cobrancas').update({ observacoes }).eq('id', id).eq('condominio_id', contexto.condominioId).eq('carteira_id', contexto.carteiraId).is('duplicada_de_id', null)
  updateQuery = atual.data.observacoes === null ? updateQuery.is('observacoes', null) : updateQuery.eq('observacoes', atual.data.observacoes)
  const update = await updateQuery.select('id')
  if (update.error || update.data?.length !== 1) throw new Error(update.error?.message ?? 'Não foi possível preservar a composição da cobrança.')
  const parcelas = await db.from('cobranca_parcelas').select('id,origem_linha_json').eq('cobranca_id', id).eq('referencia', `Recibo ${contexto.recibo}`).eq('data_vencimento', contexto.vencimento)
  if (parcelas.error) throw parcelas.error
  for (const parcela of parcelas.data ?? []) {
    const result = await db.from('cobranca_parcelas').update({ origem_linha_json: { ...parcela.origem_linha_json, ...origem } }).eq('id', parcela.id).eq('cobranca_id', id)
    if (result.error) throw result.error
  }
}
