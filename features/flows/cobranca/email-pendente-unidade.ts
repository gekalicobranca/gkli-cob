import { canaisDaRegua } from './canais'

const relation = (value: any) => Array.isArray(value) ? value[0] : value
export const STATUS_EMAIL_PENDENTE = ['pendente_aprovacao', 'aprovada', 'agendada']
export const chaveUnidadeEmail = (carteiraId: string, unidadeId: string) => `${carteiraId}:${unidadeId}`

/** Espelha validarCriacaoPorCanal: e-mail aberto na unidade + régua, em Flow não cancelado. */
export async function carregarReguasEmailPendentesUnidade(
  db: { from: (table: string) => any },
  rows: { carteira_id?: string; unidade_id?: string }[],
  reguas: { id: string; carteira_id?: string | null; etapas?: { canal?: string; ativo?: boolean }[] }[],
) {
  const pendentes = new Map<string, Set<string>>()
  const reguasEmail = reguas.filter(regua => canaisDaRegua(regua).includes('email'))
  if (!reguasEmail.length) return pendentes
  const porCarteira = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.carteira_id || !row.unidade_id) continue
    const unidades = porCarteira.get(row.carteira_id) ?? new Set<string>()
    unidades.add(row.unidade_id)
    porCarteira.set(row.carteira_id, unidades)
  }
  const consultas: Array<() => Promise<void>> = []
  for (const [carteiraId, unidades] of porCarteira) {
    const ids = [...unidades]
    const reguaIds = reguasEmail.filter(regua => !regua.carteira_id || regua.carteira_id === carteiraId).map(regua => regua.id)
    if (!reguaIds.length) continue
    for (let inicio = 0; inicio < ids.length; inicio += 80) {
      const parte = ids.slice(inicio, inicio + 80)
      consultas.push(async () => {
        for (let pagina = 0; ; pagina += 500) {
          const { data, error } = await db.from('mensagens')
            .select('id,cobranca:cobrancas!inner(unidade_id),flow:cobranca_flows!inner(regua_id,status)')
            .eq('carteira_id', carteiraId).eq('canal', 'email')
            .in('cobranca.unidade_id', parte).in('status', STATUS_EMAIL_PENDENTE)
            .in('flow.regua_id', reguaIds).neq('flow.status', 'cancelado')
            .order('id').range(pagina, pagina + 499)
          if (error) throw new Error('Não foi possível conferir os e-mails pendentes das unidades. Atualize a lista antes de gerar Flows.')
          for (const mensagem of data ?? []) {
            const unidadeId = relation(mensagem.cobranca)?.unidade_id
            const reguaId = relation(mensagem.flow)?.regua_id
            if (!unidadeId || !reguaId) continue
            const key = chaveUnidadeEmail(carteiraId, unidadeId)
            const ocupadas = pendentes.get(key) ?? new Set<string>()
            ocupadas.add(reguaId)
            pendentes.set(key, ocupadas)
          }
          if ((data ?? []).length < 500) break
        }
      })
    }
  }
  for (let inicio = 0; inicio < consultas.length; inicio += 4) {
    await Promise.all(consultas.slice(inicio, inicio + 4).map(consultar => consultar()))
  }
  return pendentes
}
