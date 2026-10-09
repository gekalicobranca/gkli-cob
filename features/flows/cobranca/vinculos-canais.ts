import type { createAdminClient } from '@/utils/supabase/admin'
import { canaisDaRegua, conflitoDeCanais } from './canais'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

const FLOWS_TERMINAIS = new Set(['concluido', 'concluido_com_falhas', 'cancelado'])

// Ativar a cobrança não cria mensagens. Um Flow encerrado conserva seu
// histórico, mas não pode impedir o retorno manual à cobrança ativa.
export function temFlowEmAndamento(item: { flow?: any }) {
  return !FLOWS_TERMINAIS.has(relation(item.flow)?.status)
}

export function vinculoOcupaCanal(item: { status?: string; flow?: any; mensagem?: any }) {
  const mensagem = relation(item.mensagem)
  if (mensagem?.status === 'cancelada'
    && String(mensagem.erro ?? '').startsWith('Envio cancelado: cobrança fora da cobrança ativa.')) return false
  if (!mensagem && ['pulada', 'cancelado'].includes(item.status ?? '') && !temFlowEmAndamento(item)) return false
  // Mensagens enviadas e tentativas não encerradas continuam protegidas.
  return true
}

// Inclui itens sem mensagem (tentativas anteriores) e mensagens órfãs pendentes.
// Os canais gravados no Flow preservam o vínculo mesmo se a régua for editada.
export async function carregarCanaisOcupados(db: ReturnType<typeof createAdminClient>, ids: string[], options: { carteiraIds?: string[] } = {}) {
  const map = new Map<string, Set<string>>()
  if (!ids.length) return map
  function add(id: string, canais: string[]) {
    const current = map.get(id) ?? new Set<string>()
    for (const canal of canais) current.add(canal)
    map.set(id, current)
  }
  // Em recortes grandes, uma consulta curta por carteira pode substituir
  // dezenas de consultas vazias de mensagens órfãs. Se houver muitas órfãs,
  // volta à consulta por IDs, sem truncar a checagem de duplicidade.
  let orfasConferidas = false
  const carteiras = [...new Set(options.carteiraIds ?? [])]
  if (ids.length >= 320 && carteiras.length > 0 && carteiras.length <= 80) {
    const { data, error } = await db.from('mensagens').select('id,cobranca_id,canal')
      .in('carteira_id', carteiras).is('cobranca_flow_id', null)
      .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).order('id').limit(500)
      .abortSignal(AbortSignal.timeout(4000))
    // Uma otimização lenta ou indisponível nunca dispensa a checagem por IDs.
    if (!error && (data?.length ?? 0) < 500) {
      const candidatas = new Set(ids)
      for (const row of data ?? []) if (row.cobranca_id && candidatas.has(row.cobranca_id)) add(row.cobranca_id, [row.canal || '*'])
      orfasConferidas = true
    }
  }
  async function carregarParte(parte: string[]) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('lote_itens')
        .select('id,cobranca_id,status,flow:cobranca_flows!lote_itens_cobranca_flow_id_fkey(status,canais:payload->canais,regua:reguas(etapas:regua_etapas(canal,ativo))),mensagem:mensagens!lote_itens_mensagem_id_fkey(canal,status,erro)')
        .in('cobranca_id', parte).not('cobranca_flow_id', 'is', null).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Erro ao conferir canais dos Flows: ${error.message}`)
      for (const row of data ?? []) {
        if (!vinculoOcupaCanal(row)) continue
        const flow = relation(row.flow)
        const message = relation(row.mensagem)
        const canais = [...new Set<string>([
          ...(Array.isArray(flow?.canais) ? flow.canais : canaisDaRegua(relation(flow?.regua) ?? {})),
          ...(message?.canal ? [message.canal] : []),
        ])]
        if (row.cobranca_id) add(row.cobranca_id, canais.length ? canais : ['*'])
      }
      if ((data ?? []).length < 500) break
    }
    for (let offset = 0; !orfasConferidas; offset += 500) {
      const { data, error } = await db.from('mensagens').select('id,cobranca_id,canal')
        .in('cobranca_id', parte).is('cobranca_flow_id', null)
        .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Erro ao conferir mensagens sem Flow: ${error.message}`)
      for (const row of data ?? []) if (row.cobranca_id) add(row.cobranca_id, [row.canal || '*'])
      if ((data ?? []).length < 500) break
    }
  }
  // A contagem de disponíveis verifica todo o recorte. Limite a concorrência
  // para não serializar dezenas de consultas nem sobrecarregar o banco.
  for (let start = 0; start < ids.length; start += 320) {
    const partes = [0, 80, 160, 240].map(offset => ids.slice(start + offset, Math.min(start + offset + 80, start + 320)))
    await Promise.all(partes.filter(parte => parte.length > 0).map(carregarParte))
  }
  return map
}

export async function validarCriacaoPorCanal(db: ReturnType<typeof createAdminClient>, rows: { id: string; carteira_id: string; condominio_id: string }[], reguaId: string) {
  if (!rows.length || rows.some(row => row.carteira_id !== rows[0].carteira_id || row.condominio_id !== rows[0].condominio_id)) throw new Error('Selecione um condomínio e uma carteira por Flow.')
  const { data: regua, error } = await db.from('reguas').select('id,carteira_id,tipo,ativo,status,etapas:regua_etapas(canal,ativo)').eq('id', reguaId).single()
  if (error || !regua || regua.tipo !== 'cobranca' || regua.ativo === false || regua.status === 'inativa'
    || (regua.carteira_id && regua.carteira_id !== rows[0].carteira_id)) throw new Error('Selecione uma régua de cobrança ativa desta carteira.')
  const canais = canaisDaRegua(regua)
  if (!canais.length) throw new Error('A régua não tem etapas ativas.')
  const { data: jobs, error: jobError } = await db.from('maestro_flow_montagens')
    .select('id,regua:reguas(etapas:regua_etapas(canal,ativo))').eq('condominio_id', rows[0].condominio_id)
    .in('status', ['pendente', 'processando', 'atencao'])
  if (jobError && !['42P01', 'PGRST205'].includes(jobError.code)) throw new Error('Não foi possível conferir a fila do Maestro.')
  // Antes do planejamento o Maestro escolhe exclusivamente réguas de e-mail.
  if ((jobs ?? []).some(job => conflitoDeCanais(relation(job.regua) ? canaisDaRegua(relation(job.regua)) : ['email'], canais))) {
    throw new Error('Este condomínio tem uma montagem do Maestro pendente neste canal. Acompanhe a montagem antes de criar outro Flow.')
  }
  const ocupados = await carregarCanaisOcupados(db, rows.map(row => row.id))
  if (rows.some(row => conflitoDeCanais(ocupados.get(row.id) ?? [], canais))) {
    throw new Error('Uma ou mais cobranças já possuem Flow ou mensagem pendente no mesmo canal. Atualize a lista e revise a seleção.')
  }
  return canais
}
