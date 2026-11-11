import { somenteCobrancasCanonicas } from '../../../lib/core/cobranca-arquivamento'
import { carregarCanaisOcupados } from './vinculos-canais'
import { conflitoDeCanais } from './canais'
import { createAdminClient } from '@/utils/supabase/admin'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { escolherContatoRegua } from '@/features/regua/services/regua-shared'
import { dividirCriacaoFlows } from './dividir-criacao'
import { consolidarEmailsLote } from './consolidar-emails'
import { consolidarWhatsAppLote } from './consolidar-whatsapp'
import { motivoExclusaoMaestro, motivoSaneamentoMaestro } from './maestro-elegibilidade'
import { motivoImpedimentoFlow } from './eligibilidade'
import { resolverCorrespondenciasUnidade } from '@/lib/core/identidade-unidade'
import { carregarApoiosParaCorrespondencia } from '@/features/responsaveis-unidades/correspondencia'
import { flowBudgetRemaining } from '@/lib/jobs/flow-execution'

const relation = (v: any) => Array.isArray(v) ? v[0] : v
const origens = ['maestro', 'maestro_agendada', 'agenda_mensal']
const canaisMaestro = ['email', 'whatsapp'] as const
type CanalMaestro = typeof canaisMaestro[number]

export async function enfileirarMontagemMaestro(execucaoId: string, conversaoId: string) {
  const db = createAdminClient()
  const { data: execucao, error } = await db.from('agente_execucoes').select('id,origem,condominio_id,carteira_id').eq('id', execucaoId).single()
  const { data: conversao, error: ce } = await db.from('conversoes_relatorio').select('id,status,condominio_id,carteira_id').eq('id', conversaoId).single()
  const { data: arquivo, error: ae } = await db.from('agente_arquivos').select('id').eq('id', conversaoId).eq('execucao_id', execucaoId).maybeSingle()
  if (error || ce || ae || !arquivo || !origens.includes(execucao.origem) || !['concluido', 'concluido_com_alertas'].includes(conversao.status) || conversao.condominio_id !== execucao.condominio_id || conversao.carteira_id !== execucao.carteira_id) throw new Error('Importação incompatível com a execução do Maestro.')
  const { error: insertError } = await db.from('maestro_flow_montagens').upsert({ execucao_id: execucaoId, conversao_id: conversaoId, carteira_id: execucao.carteira_id, condominio_id: execucao.condominio_id }, { onConflict: 'conversao_id', ignoreDuplicates: true })
  if (insertError) throw new Error(`Erro ao enfileirar flows: ${insertError.message}`)
}

async function planejar(db: ReturnType<typeof createAdminClient>, job: any) {
  const { data: condominio, error: ce } = await db.from('condominios').select('id,status,carteira_id,regua_cobranca_id,inicio_cobranca_dias,dias_apos_vencimento_regua').eq('id', job.condominio_id).single()
  if (ce || condominio.status !== 'ativo' || condominio.carteira_id !== job.carteira_id) throw new Error('Condomínio inativo ou com carteira alterada. Revise o cadastro.')
  const { data: reguas, error: re } = await db.from('reguas').select('id,ativo,status,destinatario_preferencial,etapas:regua_etapas(canal,ativo)')
    .eq('carteira_id', job.carteira_id).eq('tipo', 'cobranca').order('prioridade', { ascending: false }).order('nome')
  if (re) throw new Error(re.message)
  const reguaPorCanal = (canal: CanalMaestro) => {
    const validas = (reguas ?? []).filter(r => {
      const etapas = r.etapas.filter(e => e.ativo !== false)
      return r.ativo !== false && r.status !== 'inativa' && etapas.length && etapas.every(e => e.canal === canal)
    })
    return validas.find(r => r.id === condominio.regua_cobranca_id) ?? validas[0]
  }
  const emailRegua = reguaPorCanal('email')
  const whatsappRegua = reguaPorCanal('whatsapp')
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await somenteCobrancasCanonicas(db.from('cobrancas').select('id,unidade_id,status,status_operacional,status_financeiro,automacao_bloqueada,vencimento,unidade:unidades(identificacao,bloco,responsavel_nome,email,telefone,acao_judicial)'))
      .eq('conversao_relatorio_id', job.conversao_id).eq('condominio_id', job.condominio_id).eq('carteira_id', job.carteira_id).order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (rows.length > 2_000) throw new Error('Planejamento automático limitado a 2.000 cobranças por importação. Divida a importação ou monte os Flows manualmente.')
    if ((data ?? []).length < 500) break
  }
  const apoios = await carregarApoiosParaCorrespondencia(db, [job.condominio_id])
  const acordos = new Set<string>(), vinculadas = new Set<string>()
  for (let offset = 0; offset < rows.length; offset += 100) {
    const ids = rows.slice(offset, offset + 100).map(r => r.id)
    const [a, v] = await Promise.all([
      db.rpc('flow_cobrancas_bloqueadas_por_acordo', { p_ids: ids }),
      carregarCanaisOcupados(db, ids, { novaCaptacaoMaestro: true }),
    ])
    if (a.error) throw new Error('Não foi possível conferir acordos e flows anteriores.')
    for (const id of (a.data ?? []) as string[]) acordos.add(id)
    v.forEach((canais, id) => { if (conflitoDeCanais(canais, [...canaisMaestro])) vinculadas.add(id) })
  }
  const elegiveis: Record<CanalMaestro, any[]> = { email: [], whatsapp: [] }
  const pendencias: any[] = []
  for (const row of rows) {
    const unidade = relation(row.unidade)
    let motivo = vinculadas.has(row.id)
      ? 'Já vinculada a outro Flow'
      : motivoExclusaoMaestro(row, Number(condominio.dias_apos_vencimento_regua ?? condominio.inicio_cobranca_dias ?? 30), acordos.has(row.id))
        ?? motivoImpedimentoFlow(row)
    let saneamento = false
    let canal: CanalMaestro | null = null
    if (!motivo) {
      const contatos = resolverCorrespondenciasUnidade(unidade ?? {}, apoios ?? []).correspondencias
      const email = escolherContatoRegua({ unidade, apoios: contatos, canal: 'email', preferencia: emailRegua?.destinatario_preferencial })
      const celular = escolherContatoRegua({ unidade, apoios: contatos, canal: 'whatsapp', preferencia: whatsappRegua?.destinatario_preferencial })
      canal = email.destinatario ? 'email' : celular.destinatario ? 'whatsapp' : null
      motivo = !String(unidade?.responsavel_nome ?? '').trim()
        ? motivoSaneamentoMaestro(unidade?.responsavel_nome, null)
        : canal ? null : 'E-mail e celular ausentes ou inválidos'
      saneamento = Boolean(motivo)
      if (!motivo && !(canal === 'email' ? emailRegua : whatsappRegua)) {
        motivo = canal === 'email' ? 'Régua de e-mail indisponível' : 'Régua de WhatsApp indisponível'
      }
    }
    if (motivo) pendencias.push({ cobranca_id: row.id, motivo, saneamento })
    else if (canal) elegiveis[canal].push(row)
  }
  const partes = canaisMaestro.flatMap(canal => dividirCriacaoFlows(elegiveis[canal]).map(rows => ({
    ids: rows.map(r => r.id), regua: (canal === 'email' ? emailRegua : whatsappRegua)!.id,
  })))
  const plano = partes.map(parte => parte.ids)
  const reguas_por_parte = partes.map(parte => parte.regua)
  const regua_id = reguas_por_parte[0] ?? null
  const { error } = await db.from('maestro_flow_montagens').update({ plano, reguas_por_parte, regua_id, pendencias, erro: null, updated_at: new Date().toISOString(), ...(plano.length ? {} : { status: 'concluido', token: null, lease_ate: null }) }).eq('id', job.id).eq('token', job.token)
  if (error) throw new Error(error.message)
  return { ...job, plano, reguas_por_parte, regua_id, pendencias }
}

export async function processarMontagemMaestro(execucaoManualId?: string) {
  const db = createAdminClient()
  const { data: controle, error: controleError } = await db.from('automacao_controle').select('ativo').eq('chave', 'captacao_global').maybeSingle()
  if (controleError) throw new Error('Não foi possível conferir o controle do Maestro.')
  if (controle?.ativo === false && !execucaoManualId) return { processadas: 0, pausada: true }
  const { data, error } = execucaoManualId
    ? await db.rpc('maestro_flow_claim_execucao', { p_execucao_id: execucaoManualId })
    : await db.rpc('maestro_flow_claim')
  if (error) throw new Error(error.message)
  let job = data?.[0]
  if (!job) return { processadas: 0 }
  const fases: Record<string, { ms: number; consultas: number | null }> = {}
  async function medir<T>(fase: string, executar: () => Promise<T>): Promise<T> {
    const inicio = performance.now()
    const antes = flowBudgetRemaining()
    try { return await executar() }
    finally {
      const depois = flowBudgetRemaining()
      fases[fase] = {
        ms: Math.round(performance.now() - inicio),
        consultas: antes && depois ? antes.queries - depois.queries : null,
      }
    }
  }
  try {
    if (!job.plano) job = await medir('planejamento', () => planejar(db, job))
    if (!job.plano.length) return { processadas: 1, jobId: job.id, status: 'concluido', flows: 0, fases }
    const { data: condominio, error: ce } = await db.from('condominios').select('nome,nome_operacional,status,carteira_id,carteira:carteiras(nome)').eq('id', job.condominio_id).single()
    if (ce || condominio.status !== 'ativo' || condominio.carteira_id !== job.carteira_id) throw new Error('Condomínio inativo ou carteira alterada durante a montagem.')
    const reguaId = job.reguas_por_parte?.[job.parte] ?? job.regua_id
    if (reguaId !== job.regua_id) {
      const { data: reserva, error } = await db.from('maestro_flow_montagens').update({ regua_id: reguaId })
        .eq('id', job.id).eq('token', job.token).is('lote_id', null).select('id').maybeSingle()
      if (error || !reserva) throw new Error(error?.message ?? 'Não foi possível selecionar a régua da parte reservada.')
    }
    const { data: loteId, error: le } = await db.rpc('maestro_flow_lote', { p_job: job.id, p_token: job.token })
    if (le) throw new Error(le.message)
    await medir('regua', () => processarReguaCobranca({ origem: 'maestro_captacao', carteiraId: job.carteira_id, condominioId: job.condominio_id,
      cobrancaIds: job.plano[job.parte], reguaId, cooldownDias: 0, loteRetomadaId: loteId, montagemMaestroId: job.id }))
    await medir('consolidacao', async () => {
      await consolidarEmailsLote(loteId)
      await consolidarWhatsAppLote(loteId)
    })
    const carteira = relation(condominio.carteira)
    const nome = `Flow cobrança · ${carteira?.nome ?? 'Carteira'} · ${condominio.nome_operacional || condominio.nome} · Maestro · parte ${job.parte + 1}`
    const { data: flowId, error: fe } = await medir('finalizacao', async () =>
      db.rpc('maestro_flow_finalizar', { p_job: job.id, p_token: job.token, p_nome: nome }))
    if (fe) throw new Error(fe.message)
    return { processadas: 1, jobId: job.id, flowId, fases }
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Falha na montagem dos flows.'
    const { error: updateError } = await db.from('maestro_flow_montagens').update({ status: 'atencao', erro: mensagem, token: null, lease_ate: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('token', job.token)
    if (updateError) throw new Error(updateError.message)
    return { processadas: 1, jobId: job.id, status: 'atencao', erro: mensagem, fases }
  }
}
