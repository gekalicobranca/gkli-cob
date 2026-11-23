export type ContextoPausa = {
  carteiraId?: string | null
  cobrancaId?: string | null
  unidadeId?: string | null
  acordoId?: string | null
  condominioId?: string | null
}

export type PausaRegua = {
  id: string
  carteira_id?: string | null
  cobranca_id?: string | null
  unidade_id?: string | null
  acordo_id?: string | null
  condominio_id?: string | null
  ativo?: boolean
  pausa_ate?: string | null
  motivo?: string | null
  origem?: string | null
  regra_codigo?: string | null
}

// Unidade preenchida delimita a comunicação mesmo quando há acordo/condomínio de contexto.
export const ESCOPOS_PAUSA = [
  ['cobranca_id', 'cobrancaId'],
  ['unidade_id', 'unidadeId'],
  ['acordo_id', 'acordoId'],
  ['condominio_id', 'condominioId'],
] as const

export function pausaAbrangeContexto(pausa: PausaRegua, ctx: ContextoPausa, agora = new Date()) {
  if (pausa.ativo === false || (pausa.pausa_ate && !(Date.parse(pausa.pausa_ate) >= agora.getTime()))) return false
  if (pausa.carteira_id && pausa.carteira_id !== ctx.carteiraId) return false
  const escopo = ESCOPOS_PAUSA.find(([coluna]) => pausa[coluna])
  return Boolean(escopo && pausa[escopo[0]] === ctx[escopo[1]])
}

/** Consulta em partes, sem uma chamada por cobrança e sem truncar pausas após 500 registros. */
export async function carregarPausasRegua(
  db: { from: (table: string) => any }, contextos: ContextoPausa[], agora = new Date(),
): Promise<PausaRegua[]> {
  const pausas = new Map<string, PausaRegua>()
  const consultas: Array<() => Promise<void>> = []
  for (let nivel = 0; nivel < ESCOPOS_PAUSA.length; nivel++) {
    const [coluna, campo] = ESCOPOS_PAUSA[nivel]
    const ids = [...new Set(contextos.map(ctx => ctx[campo]).filter(Boolean))]
    for (let inicio = 0; inicio < ids.length; inicio += 100) {
      const parte = ids.slice(inicio, inicio + 100)
      consultas.push(async () => {
      for (let pagina = 0; ; pagina += 500) {
        let query = db.from('regua_pausas')
          .select('id,carteira_id,cobranca_id,unidade_id,acordo_id,condominio_id,ativo,motivo,pausa_ate,origem,regra_codigo')
          .eq('ativo', true).or(`pausa_ate.is.null,pausa_ate.gte.${agora.toISOString()}`)
          .in(coluna, parte)
        for (let anterior = 0; anterior < nivel; anterior++) query = query.is(ESCOPOS_PAUSA[anterior][0], null)
        const { data, error } = await query.order('id').range(pagina, pagina + 499)
        // Falha de consulta não pode liberar comunicação protegida por conciliação.
        if (error) throw new Error('Não foi possível conferir as pausas da régua. Tente novamente antes de gerar mensagens.')
        for (const pausa of data ?? []) pausas.set(pausa.id, pausa)
        if ((data ?? []).length < 500) break
      }
      })
    }
  }
  for (let inicio = 0; inicio < consultas.length; inicio += 4) {
    await Promise.all(consultas.slice(inicio, inicio + 4).map(consultar => consultar()))
  }
  return [...pausas.values()]
}

export async function filtrarCobrancasSemPausa<T extends {
  id: string; carteira_id?: string; unidade_id?: string; condominio_id?: string;
}>(db: { from: (table: string) => any }, rows: T[], agora = new Date()): Promise<T[]> {
  const contexto = (row: T): ContextoPausa => ({
    carteiraId: row.carteira_id, cobrancaId: row.id, unidadeId: row.unidade_id, condominioId: row.condominio_id,
  })
  const pausas = await carregarPausasRegua(db, rows.map(contexto), agora)
  return rows.filter(row => !pausas.some(pausa => pausaAbrangeContexto(pausa, contexto(row), agora)))
}
