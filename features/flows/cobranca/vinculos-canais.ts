import type { createAdminClient } from '@/utils/supabase/admin'
import { canaisDaRegua, conflitoDeCanais } from './canais'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

// Inclui itens sem mensagem (tentativas anteriores) e mensagens órfãs pendentes.
// Os canais gravados no Flow preservam o vínculo mesmo se a régua for editada.
export async function carregarCanaisOcupados(db: ReturnType<typeof createAdminClient>, ids: string[]) {
  const map = new Map<string, Set<string>>()
  function add(id: string, canais: string[]) {
    const current = map.get(id) ?? new Set<string>()
    for (const canal of canais) current.add(canal)
    map.set(id, current)
  }
  for (let start = 0; start < ids.length; start += 80) {
    const parte = ids.slice(start, start + 80)
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('lote_itens')
        .select('id,cobranca_id,flow:cobranca_flows!lote_itens_cobranca_flow_id_fkey(payload,regua:reguas(etapas:regua_etapas(canal,ativo))),mensagem:mensagens!lote_itens_mensagem_id_fkey(canal)')
        .in('cobranca_id', parte).not('cobranca_flow_id', 'is', null).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Erro ao conferir canais dos Flows: ${error.message}`)
      for (const row of data ?? []) {
        const flow = relation(row.flow)
        const message = relation(row.mensagem)
        const canais = [...new Set<string>([
          ...(Array.isArray(flow?.payload?.canais) ? flow.payload.canais : canaisDaRegua(relation(flow?.regua) ?? {})),
          ...(message?.canal ? [message.canal] : []),
        ])]
        if (row.cobranca_id) add(row.cobranca_id, canais.length ? canais : ['*'])
      }
      if ((data ?? []).length < 500) break
    }
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('mensagens').select('id,cobranca_id,canal')
        .in('cobranca_id', parte).is('cobranca_flow_id', null)
        .in('status', ['pendente_aprovacao', 'aprovada', 'agendada']).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Erro ao conferir mensagens sem Flow: ${error.message}`)
      for (const row of data ?? []) if (row.cobranca_id) add(row.cobranca_id, [row.canal || '*'])
      if ((data ?? []).length < 500) break
    }
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
