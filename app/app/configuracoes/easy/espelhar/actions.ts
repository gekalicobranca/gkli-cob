'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { revalidatePath } from 'next/cache'
import { criarFlowsComDestinatariosConferidos } from '@/features/flows/cobranca/actions'
import { carregarApoiosParaCorrespondencia } from '@/features/responsaveis-unidades/correspondencia'
import { resolverCorrespondenciasUnidade } from '@/lib/core/identidade-unidade'
import { escolherContatoRegua } from '@/features/regua/services/regua-shared'
import { lerDemonstrativoRepasses } from '@/features/easy-cob/demonstrativo-repasses'
import type { CondominioEspelhamento, ResultadoEspelhamento } from './types'

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export async function consultarEspelhamentos(): Promise<CondominioEspelhamento[]> {
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  const { data, error } = await db.rpc('easy_espelhamento_painel_resumo', { p_carteiras: scope.carteiraIds })
  if (error) throw new Error('Não foi possível consultar o espelhamento.')
  return data as CondominioEspelhamento[]
}

export async function consultarDetalheEspelhamento(execucaoId: string): Promise<ResultadoEspelhamento | null> {
  if (!uuid.test(execucaoId)) return null
  const scope = await getPermittedCarteiras()
  const { data, error } = await applyCarteiraScope(createAdminClient().from('easy_espelhamentos')
    .select('resultado').eq('id', execucaoId).eq('estado', 'concluido'), scope.carteiraIds).maybeSingle()
  if (error) throw new Error('Não foi possível consultar o resultado.')
  const resultado = data?.resultado as ResultadoEspelhamento | null
  const contatos = resultado?.contatosEFlows
  if (contatos) {
    contatos.candidatas = contatos.candidatas.map(({ id, unidadeId, unidade, bloco, recibo, saldoCentavos, canais }) =>
      ({ id, unidadeId, unidade, bloco, recibo, saldoCentavos, canais }))
    contatos.revisoes = contatos.revisoes.map(({ unidade, bloco, motivo, unidadeId, revisao }) => ({ unidade, bloco, motivo, unidadeId, revisao }))
  }
  return resultado ?? null
}

export async function configurarAgendaEspelhamento(condominioId: string, ativa: boolean) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor'].includes(scope.perfil)) return { error: 'A configuração da agenda exige perfil de gestão.' }
  const db = createAdminClient()
  const { data: alvos, error: erroAlvos } = await db.rpc('easy_espelhamento_condominios', { p_carteiras: scope.carteiraIds })
  if (erroAlvos || !alvos?.some(c => c.id === condominioId)) return { error: 'Condomínio sem espelhamento disponível nesta carteira.' }
  const { error } = await applyCarteiraScope(db.from('condominios').update({ easy_espelhamento_agendado: ativa === true }).eq('id', condominioId), scope.carteiraIds)
  return error ? { error: 'Não foi possível configurar a agenda.' } : { mensagem: ativa ? 'Conferência mensal habilitada.' : 'Conferência mensal desabilitada.' }
}

export async function entregarPreJuridico(execucaoId: string, unidadeId: string) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) return { error: 'Seu perfil não pode encaminhar cotas.' }
  const db = createAdminClient()
  const { data: execucao, error: erroConsulta } = await applyCarteiraScope(db.from('easy_espelhamentos').select('id').eq('id', execucaoId), scope.carteiraIds).maybeSingle()
  if (erroConsulta || !execucao) return { error: 'Conferência indisponível para esta carteira.' }
  const { error } = await db.rpc('easy_espelhamento_entregar_pre', { p_execucao: execucao.id, p_unidade: unidadeId, p_usuario: scope.userId })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Dossiê indisponível ou vínculo alterado. Atualize a conferência.' }
  revalidatePath('/app/pre-juridico', 'layout')
  revalidatePath('/app/cobrancas', 'layout')
  return { mensagem: 'Dossiê encaminhado. O caso está em confirmação da propriedade.' }
}

export async function aplicarContatoEspelhado(execucaoId: string, unidadeId: string) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) return { error: 'Seu perfil não pode atualizar contatos.' }
  const db = createAdminClient()
  const { data: execucao, error: erroConsulta } = await applyCarteiraScope(db.from('easy_espelhamentos').select('id').eq('id', execucaoId), scope.carteiraIds).maybeSingle()
  if (erroConsulta || !execucao) return { error: 'Conferência indisponível para esta carteira.' }
  const { error } = await db.rpc('easy_espelhamento_aplicar_contato', { p_execucao: execucao.id, p_unidade: unidadeId, p_usuario: scope.userId })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Contato indisponível. Atualize a conferência.' }
  revalidatePath(`/app/unidades/${unidadeId}`)
  return { mensagem: 'Contato atualizado conforme a ficha da Lello.' }
}

export async function aprovarBorderoEspelhado(execucaoId: string, fim: string) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor'].includes(scope.perfil)) return { error: 'A aprovação do borderô exige perfil de gestão.' }
  const db = createAdminClient()
  const { data: execucao, error: erroConsulta } = await applyCarteiraScope(db.from('easy_espelhamentos').select('id').eq('id', execucaoId), scope.carteiraIds).maybeSingle()
  if (erroConsulta || !execucao) return { error: 'Conferência indisponível para esta carteira.' }
  const { data: periodo, error } = await db.rpc('easy_espelhamento_aprovar_bordero', { p_execucao: execucao.id, p_usuario: scope.userId, p_fim: fim })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Borderô indisponível para o fechamento. Confira o período e as parcelas.' }
  revalidatePath(`/app/gestao/fechamento/${periodo}`)
  return { mensagem: 'Borderô aprovado e vinculado ao fechamento.' }
}

export async function prepararFlowEspelhado(execucaoId: string, unidadeId: string, canal: 'email' | 'whatsapp') {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil) || !['email', 'whatsapp'].includes(canal)) return { error: 'Montagem indisponível.' }
  const db = createAdminClient()
  const { data: execucao, error: erroConsulta } = await applyCarteiraScope(db.from('easy_espelhamentos')
    .select('id,carteira_id,condominio_id,criado_em,resultado').eq('id', execucaoId).eq('estado', 'concluido'), scope.carteiraIds).maybeSingle()
  if (erroConsulta || !execucao) return { error: 'Conferência indisponível para esta carteira.' }
  const resultado = execucao.resultado as ResultadoEspelhamento
  const selecionadas = resultado?.contatosEFlows?.candidatas.filter(c => c.id && c.unidadeId === unidadeId && c.destinatarios?.[canal]) ?? []
  if (!selecionadas.length) return { error: 'Nenhum recibo confirmado para este canal.' }
  const [ultimo, unidade, condominio, reguas, acordos, cobrancas, judiciais] = await Promise.all([
    db.from('easy_espelhamentos').select('id').eq('condominio_id', execucao.condominio_id).eq('estado', 'concluido').gt('criado_em', execucao.criado_em).limit(1),
    db.from('unidades').select('id,identificacao,bloco,responsavel_nome,telefone,email,acao_judicial,numero_processo,conducao_processo')
      .eq('id', unidadeId).eq('condominio_id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id).single(),
    db.from('condominios').select('regua_cobranca_id,dias_apos_vencimento_regua,inicio_cobranca_dias,dias_cobranca_ativa,pre_juridico_habilitado,carteira:carteiras(pre_juridico_habilitado)')
      .eq('id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id).eq('status', 'ativo').single(),
    db.from('reguas').select('id,destinatario_preferencial,etapas:regua_etapas(canal,ativo)').eq('carteira_id', execucao.carteira_id)
      .eq('tipo', 'cobranca').eq('ativo', true).neq('status', 'inativa').order('prioridade', { ascending: false }).order('nome'),
    db.rpc('flow_cobrancas_bloqueadas_por_acordo', { p_ids: selecionadas.map(c => c.id) }),
    db.from('cobrancas').select('id,vencimento,data_pagamento,observacoes').eq('unidade_id', unidadeId).in('id', selecionadas.map(c => c.id)),
    db.from('acordos').select('id').eq('unidade_id', unidadeId).eq('tipo', 'judicial').limit(1),
  ])
  const cadastro = unidade.data
  if ([ultimo, unidade, condominio, reguas, acordos, cobrancas, judiciais].some(r => r.error) || ultimo.data?.length || !cadastro || !condominio.data
    || cadastro.acao_judicial || cadastro.numero_processo || ['nosso_escritorio', 'outro_advogado'].includes(cadastro.conducao_processo)
    || acordos.data?.length || judiciais.data?.length || cobrancas.data?.length !== selecionadas.length) return { error: 'Conferência desatualizada ou cobrança impedida.' }
  const regras = condominio.data
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  if (resultado.preJuridico?.dataBase !== hoje) return { error: 'Refaça o espelhamento para validar os recibos de hoje.' }
  const carteira = Array.isArray(regras.carteira) ? regras.carteira[0] : regras.carteira
  const prazo = (regras.inicio_cobranca_dias ?? 0) + (regras.dias_cobranca_ativa ?? 60)
  const inicio = regras.dias_apos_vencimento_regua ?? regras.inicio_cobranca_dias ?? 30
  if (cobrancas.data.some(c => {
    const dias = (Date.parse(hoje) - Date.parse(c.vencimento)) / 86_400_000
    const recibo = String(c.observacoes ?? '').match(/\brecibo\s*:?\s*(?:(?:LELLO|AE|AJ|J|A|D|B|P)\s+)?(\d{6,})(?!\d)/i)?.[1]
    return c.data_pagamento || !selecionadas.some(r => r.id === c.id && r.recibo === recibo) || dias < Math.max(1, inicio)
      || (regras.pre_juridico_habilitado && carteira?.pre_juridico_habilitado && dias >= prazo)
  })) return { error: 'Uma cota saiu da régua. Refaça a conferência.' }
  const validas = reguas.data.filter(r => {
    const ativas = r.etapas.filter(e => e.ativo !== false)
    return ativas.length > 0 && ativas.every(e => e.canal === canal)
  })
  const regua = validas.find(r => r.id === regras.regua_cobranca_id) ?? validas[0]
  if (!regua) return { error: 'Régua ativa deste canal indisponível.' }
  const apoios = await carregarApoiosParaCorrespondencia(db, [execucao.condominio_id])
  const correspondencias = resolverCorrespondenciasUnidade({ ...cadastro, condominio_id: execucao.condominio_id }, apoios).correspondencias
  const contato = escolherContatoRegua({ unidade: cadastro, apoios: correspondencias, canal, preferencia: regua.destinatario_preferencial })
  const destino = canal === 'email' ? contato.destinatario?.trim().toLowerCase() : contato.destinatario?.replace(/\D/g, '')
  if (!destino || selecionadas.some(c => c.destinatarios?.[canal] !== destino)) return { error: 'O destinatário da régua diverge da ficha da Lello. Confira o cadastro.' }
  const form = new FormData()
  for (const c of selecionadas) form.append('cobranca_id', c.id)
  form.set('criar_pausado', 'true')
  form.set(`regua_id:${execucao.carteira_id}`, regua.id)
  const reserva = { espelhamento_id: execucao.id, unidade_id: unidadeId, condominio_id: execucao.condominio_id, canal }
  const { error: erroReserva } = await db.from('easy_espelhamento_flows').insert(reserva)
  if (erroReserva) {
    const { data: anterior } = await db.from('easy_espelhamento_flows').select('flow_ids').eq('espelhamento_id', execucao.id).eq('unidade_id', unidadeId).eq('canal', canal).maybeSingle()
    return anterior?.flow_ids?.length ? { mensagem: 'Flow já preparado nesta conferência.' } : { error: 'Existe uma montagem iniciada para este canal. Confira os flows e lotes antes de repetir.' }
  }
  const { error, flowIds } = await criarFlowsComDestinatariosConferidos(form, selecionadas.map(c => [c.id, destino]))
  if (flowIds?.length) {
    const { error: erroRegistro } = await db.from('easy_espelhamento_flows').update({ flow_ids: flowIds }).eq('espelhamento_id', execucao.id).eq('unidade_id', unidadeId).eq('canal', canal)
    if (erroRegistro) return { error: 'Flow criado. Confira o lote antes de repetir a montagem.' }
  } else if (error) {
    await db.from('easy_espelhamento_flows').delete().eq('espelhamento_id', execucao.id).eq('unidade_id', unidadeId).eq('canal', canal)
  }
  return error ? { error } : flowIds?.length ? { mensagem: 'Flow criado pausado para revisão.' } : { error: 'Nenhum Flow foi criado.' }
}

export async function solicitarEspelhamento(ids: string[], lote: string, aplicar: boolean, administradora: string, anexo?: FormData) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) return { error: 'Seu perfil não pode executar o espelhamento.' }
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && uuid.test(id)) || !uuid.test(lote)
    || typeof administradora !== 'string' || !administradora.trim() || administradora.length > 120) {
    return { error: 'Selecione pelo menos um condomínio válido.' }
  }
  const arquivo = anexo?.get('demonstrativo')
  let demonstrativo = null
  if (arquivo instanceof File && arquivo.size > 0) {
    if (ids.length !== 1) return { error: 'Selecione um único condomínio para anexar o demonstrativo.' }
    try { demonstrativo = await lerDemonstrativoRepasses(arquivo) }
    catch (erro) { return { error: erro instanceof Error ? erro.message : 'Demonstrativo inválido.' } }
  }
  const { data, error } = await createAdminClient().rpc('easy_espelhamento_solicitar_administradora', {
    p_carteiras: scope.carteiraIds,
    p_usuario: scope.userId,
    p_lote: lote,
    p_condominios: [...new Set(ids)],
    p_aplicar: aplicar === true,
    p_administradora: administradora,
    p_demonstrativo: demonstrativo,
  })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Não foi possível solicitar o espelhamento.' }
  return { quantidade: Number(data) }
}
