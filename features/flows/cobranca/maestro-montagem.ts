import { carregarCanaisOcupados } from './vinculos-canais'
import { conflitoDeCanais } from './canais'
import { createAdminClient } from '@/utils/supabase/admin'
import { ACORDO_STATUS_VIGENTES } from '@/lib/core/status'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { escolherContatoRegua } from '@/features/regua/services/regua-shared'
import { dividirCriacaoFlows } from './dividir-criacao'
import { consolidarEmailsLote } from './consolidar-emails'
import { motivoExclusaoMaestro, motivoSaneamentoMaestro } from './maestro-elegibilidade'

const relation = (v: any) => Array.isArray(v) ? v[0] : v
const origens = ['maestro', 'maestro_agendada', 'agenda_mensal']

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
  const validas = (reguas ?? []).filter(r => r.ativo !== false && r.status !== 'inativa' && r.etapas.some((e: any) => e.ativo !== false) && r.etapas.filter((e: any) => e.ativo !== false).every((e: any) => e.canal === 'email'))
  const regua = validas.find(r => r.id === condominio.regua_cobranca_id) ?? validas[0]
  if (!regua) throw new Error('Cadastre uma régua de cobrança por e-mail ativa para esta carteira.')
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('cobrancas').select('id,unidade_id,status,status_operacional,status_financeiro,automacao_bloqueada,vencimento,unidade:unidades(identificacao,bloco,responsavel_nome,email)')
      .eq('conversao_relatorio_id', job.conversao_id).eq('condominio_id', job.condominio_id).eq('carteira_id', job.carteira_id).order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }
  const { data: apoios, error: ae } = await db.from('responsaveis_unidades').select('unidade,bloco,responsavel_nome,email,tipo_responsavel').eq('condominio_id', job.condominio_id).eq('ativo', true)
  if (ae) throw new Error(ae.message)
  const acordos = new Set<string>(), vinculadas = new Set<string>()
  for (let offset = 0; offset < rows.length; offset += 100) {
    const ids = rows.slice(offset, offset + 100).map(r => r.id)
    const [a, v] = await Promise.all([
      db.from('acordos').select('cobranca_id').in('cobranca_id', ids).in('status', ACORDO_STATUS_VIGENTES),
      carregarCanaisOcupados(db, ids),
    ])
    if (a.error) throw new Error('Não foi possível conferir acordos e flows anteriores.')
    a.data.forEach(r => acordos.add(r.cobranca_id)); v.forEach((canais, id) => { if (conflitoDeCanais(canais, ['email'])) vinculadas.add(id) })
  }
  const elegiveis: any[] = [], pendencias: any[] = []
  for (const row of rows) {
    const unidade = relation(row.unidade)
    let motivo = vinculadas.has(row.id) ? 'Já vinculada a outro Flow de e-mail' : motivoExclusaoMaestro(row, Number(condominio.dias_apos_vencimento_regua ?? condominio.inicio_cobranca_dias ?? 30), acordos.has(row.id))
    let saneamento = false
    if (!motivo) {
      const contatos = (apoios ?? []).filter(a => String(a.unidade).trim().toLowerCase() === String(unidade?.identificacao).trim().toLowerCase() && (!a.bloco || String(a.bloco).trim().toLowerCase() === String(unidade?.bloco ?? '').trim().toLowerCase()))
      const contato = escolherContatoRegua({ unidade, apoios: contatos, canal: 'email', preferencia: regua.destinatario_preferencial })
      motivo = motivoSaneamentoMaestro(unidade?.responsavel_nome, contato.destinatario)
      saneamento = Boolean(motivo)
    }
    if (motivo) pendencias.push({ cobranca_id: row.id, motivo, saneamento })
    else elegiveis.push(row)
  }
  const plano = dividirCriacaoFlows(elegiveis).map(parte => parte.map(r => r.id))
  const { error } = await db.from('maestro_flow_montagens').update({ plano, regua_id: regua.id, pendencias, erro: null, updated_at: new Date().toISOString(), ...(plano.length ? {} : { status: 'concluido', token: null, lease_ate: null }) }).eq('id', job.id).eq('token', job.token)
  if (error) throw new Error(error.message)
  return { ...job, plano, regua_id: regua.id, pendencias }
}

export async function processarMontagemMaestro() {
  const db = createAdminClient()
  const { data: controle, error: controleError } = await db.from('automacao_controle').select('ativo').eq('chave', 'captacao_global').maybeSingle()
  if (controleError) throw new Error('Não foi possível conferir o controle do Maestro.')
  if (controle?.ativo === false) return { processadas: 0, pausada: true }
  const { data, error } = await db.rpc('maestro_flow_claim')
  if (error) throw new Error(error.message)
  let job = data?.[0]
  if (!job) return { processadas: 0 }
  try {
    if (!job.plano) job = await planejar(db, job)
    if (!job.plano.length) return { processadas: 1, jobId: job.id, status: 'concluido', flows: 0 }
    const { data: condominio, error: ce } = await db.from('condominios').select('nome,nome_operacional,status,carteira_id,carteira:carteiras(nome)').eq('id', job.condominio_id).single()
    if (ce || condominio.status !== 'ativo' || condominio.carteira_id !== job.carteira_id) throw new Error('Condomínio inativo ou carteira alterada durante a montagem.')
    const { data: loteId, error: le } = await db.rpc('maestro_flow_lote', { p_job: job.id, p_token: job.token })
    if (le) throw new Error(le.message)
    await processarReguaCobranca({ origem: 'maestro_captacao', carteiraId: job.carteira_id, condominioId: job.condominio_id,
      cobrancaIds: job.plano[job.parte], reguaId: job.regua_id, cooldownDias: 0, loteRetomadaId: loteId, montagemMaestro: true })
    await consolidarEmailsLote(loteId)
    const carteira = relation(condominio.carteira)
    const nome = `Flow cobrança · ${carteira?.nome ?? 'Carteira'} · ${condominio.nome_operacional || condominio.nome} · Maestro · parte ${job.parte + 1}`
    const { data: flowId, error: fe } = await db.rpc('maestro_flow_finalizar', { p_job: job.id, p_token: job.token, p_nome: nome })
    if (fe) throw new Error(fe.message)
    return { processadas: 1, jobId: job.id, flowId }
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Falha na montagem dos flows.'
    const { error: updateError } = await db.from('maestro_flow_montagens').update({ status: 'atencao', erro: mensagem, token: null, lease_ate: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('token', job.token)
    if (updateError) throw new Error(updateError.message)
    return { processadas: 1, jobId: job.id, status: 'atencao', erro: mensagem }
  }
}
