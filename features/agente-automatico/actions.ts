'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getAgenteWorkerByScriptKey } from './workers'
import { startLocalWorker, stopLocalWorker } from './local-workers'

async function assertCaptacaoGlobalAtiva(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.from('automacao_controle')
    .select('ativo').eq('chave', 'captacao_global').maybeSingle()
  if (error) throw new Error(`Erro ao consultar o controle da automação: ${error.message}`)
  if (data?.ativo === false) throw new Error('A captação está desligada no Maestro.')
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === 'on'
}

function getCondominioId(configJson: unknown) {
  const condominioId = (configJson as Record<string, unknown> | null)?.condominio_id
  return typeof condominioId === 'string' && condominioId ? condominioId : null
}

function getScriptKey(formData: FormData) {
  const scriptKey = getString(formData, 'script_key')
  if (!scriptKey) throw new Error('Worker não informado.')
  const worker = getAgenteWorkerByScriptKey(scriptKey)
  if (!worker) throw new Error('Worker não reconhecido.')
  return worker
}

export async function criarAgenteAdministradora(formData: FormData) {
  const supabase = await createClient()

  const carteiraId = getString(formData, 'carteira_id')
  const nome = getString(formData, 'nome')
  const urlPortal = getString(formData, 'url_portal')
  const tipoPortal = getString(formData, 'tipo_portal') || 'portal_web'
  const observacoes = getString(formData, 'observacoes')

  if (!carteiraId) throw new Error('Selecione uma carteira.')
  if (!nome) throw new Error('Informe o nome da administradora.')
  if (!urlPortal) throw new Error('Informe a URL do portal.')

  const { error } = await supabase.from('agente_administradoras').insert({
    carteira_id: carteiraId,
    nome,
    url_portal: urlPortal,
    tipo_portal: tipoPortal,
    exige_captcha: getBoolean(formData, 'exige_captcha'),
    exige_2fa: getBoolean(formData, 'exige_2fa'),
    ativo: true,
    observacoes: observacoes || null,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/app/agente-automatico')
}

export async function criarAgenteReceita(formData: FormData) {
  const supabase = await createClient()

  const administradoraId = getString(formData, 'administradora_id')
  const carteiraId = getString(formData, 'carteira_id')
  const nome = getString(formData, 'nome')
  const descricao = getString(formData, 'descricao')
  const tipoArquivo = getString(formData, 'tipo_arquivo_esperado') || 'xlsx'
  const scriptKey = getString(formData, 'script_key')

  if (!administradoraId) throw new Error('Selecione uma administradora.')
  if (!carteiraId) throw new Error('Selecione uma carteira.')
  if (!nome) throw new Error('Informe o nome da receita.')

  const { error } = await supabase.from('agente_receitas').insert({
    administradora_id: administradoraId,
    carteira_id: carteiraId,
    nome,
    descricao: descricao || null,
    tipo_coleta: 'inadimplencia',
    tipo_arquivo_esperado: tipoArquivo,
    periodicidade: 'manual',
    script_key: scriptKey || null,
    config_json: {},
    ativo: true,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/app/agente-automatico')
}

export async function executarAgenteReceita(formData: FormData) {
  const supabase = await createClient()
  await assertCaptacaoGlobalAtiva(supabase)

  const receitaId = getString(formData, 'receita_id')

  if (!receitaId) throw new Error('Receita não informada.')

  const { data: receita, error: receitaError } = await supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('id', receitaId)
    .single()

  if (receitaError) throw new Error(receitaError.message)
  if (!receita) throw new Error('Receita não encontrada.')

  const condominioId = getCondominioId(receita.config_json)
  let carteiraId = receita.carteira_id
  if (condominioId) {
    const { data: condominio, error: condominioError } = await supabase
      .from('condominios')
      .select('carteira_id')
      .eq('id', condominioId)
      .single()
    if (condominioError) throw new Error(condominioError.message)
    carteiraId = condominio?.carteira_id ?? carteiraId
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: execucao, error } = await supabase
    .from('agente_execucoes')
    .insert({
      receita_id: receita.id,
      administradora_id: receita.administradora_id,
      carteira_id: carteiraId,
      condominio_id: condominioId,
      status: 'pendente',
      solicitado_por: user?.id ?? null,
      tentativas: 0,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await supabase.from('agente_logs').insert({
    execucao_id: execucao.id,
    nivel: 'info',
    step: 'fila',
    mensagem:
      'Execução criada. Aguardando worker externo Playwright processar a coleta.',
  })

  revalidatePath('/app/agente-automatico')
  revalidatePath('/app/agente-automatico/maestro')
}

export async function executarAgenteAdministradoraAgora(formData: FormData) {
  const supabase = await createClient()
  await assertCaptacaoGlobalAtiva(supabase)
  const scope = await getPermittedCarteiras()

  const administradoraId = getString(formData, 'administradora_id')
  if (!administradoraId) throw new Error('Administradora não informada.')

  let receitasQuery = supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('administradora_id', administradoraId)
    .eq('ativo', true)

  if (scope.carteiraIds !== null) receitasQuery = receitasQuery.in('carteira_id', scope.carteiraIds)

  const { data: receitas, error: receitasError } = await receitasQuery
  if (receitasError) throw new Error(receitasError.message)
  if (!receitas?.length) throw new Error('Nenhuma receita ativa encontrada para esta administradora.')

  const receitaIds = receitas.map((receita) => receita.id)
  const { data: execucoesAbertas, error: abertasError } = await supabase
    .from('agente_execucoes')
    .select('receita_id')
    .in('receita_id', receitaIds)
    .in('status', ['pendente', 'em_execucao'])

  if (abertasError) throw new Error(abertasError.message)

  const receitasEmFila = new Set((execucoesAbertas ?? []).map((execucao) => execucao.receita_id))
  const receitasParaExecutar = receitas.filter((receita) => !receitasEmFila.has(receita.id))

  if (!receitasParaExecutar.length) {
    revalidatePath('/app/agente-automatico')
    return
  }

  const condominioIds = Array.from(new Set(receitasParaExecutar.map((receita) => getCondominioId(receita.config_json)).filter(Boolean) as string[]))
  const condominiosPorId = new Map<string, { carteira_id: string | null }>()

  if (condominioIds.length) {
    const { data: condominios, error: condominiosError } = await supabase
      .from('condominios')
      .select('id, carteira_id')
      .in('id', condominioIds)

    if (condominiosError) throw new Error(condominiosError.message)
    for (const condominio of condominios ?? []) {
      condominiosPorId.set(condominio.id, { carteira_id: condominio.carteira_id })
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payloads = receitasParaExecutar.map((receita) => {
    const condominioId = getCondominioId(receita.config_json)
    const carteiraId = condominioId ? condominiosPorId.get(condominioId)?.carteira_id ?? receita.carteira_id : receita.carteira_id

    return {
      receita_id: receita.id,
      administradora_id: receita.administradora_id,
      carteira_id: carteiraId,
      condominio_id: condominioId,
      status: 'pendente',
      solicitado_por: user?.id ?? null,
      tentativas: 0,
      origem: 'manual_administradora',
    }
  })

  const { data: execucoesCriadas, error } = await supabase
    .from('agente_execucoes')
    .insert(payloads)
    .select('id')

  if (error) throw new Error(error.message)

  if (execucoesCriadas?.length) {
    await supabase.from('agente_logs').insert(
      execucoesCriadas.map((execucao) => ({
        execucao_id: execucao.id,
        nivel: 'info',
        step: 'fila',
        mensagem: 'Execução criada por acionamento manual da administradora.',
      })),
    )
  }

  revalidatePath('/app/agente-automatico')
}

export async function executarAgenteScriptAgora(formData: FormData) {
  const supabase = await createClient()
  await assertCaptacaoGlobalAtiva(supabase)
  const scope = await getPermittedCarteiras()
  const worker = getScriptKey(formData)

  let receitasQuery = supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('script_key', worker.scriptKey)
    .eq('ativo', true)

  if (scope.carteiraIds !== null) receitasQuery = receitasQuery.in('carteira_id', scope.carteiraIds)

  const { data: receitas, error: receitasError } = await receitasQuery
  if (receitasError) throw new Error(receitasError.message)
  if (!receitas?.length) throw new Error('Nenhuma receita ativa encontrada para este worker.')

  const receitaIds = receitas.map((receita) => receita.id)
  const { data: execucoesAbertas, error: abertasError } = await supabase
    .from('agente_execucoes')
    .select('receita_id')
    .in('receita_id', receitaIds)
    .in('status', ['pendente', 'em_execucao'])

  if (abertasError) throw new Error(abertasError.message)

  const receitasEmFila = new Set((execucoesAbertas ?? []).map((execucao) => execucao.receita_id))
  const receitasParaExecutar = receitas.filter((receita) => !receitasEmFila.has(receita.id))

  if (!receitasParaExecutar.length) {
    revalidatePath('/app/agente-automatico')
    revalidatePath('/app/agente-automatico/maestro')
    return
  }

  const condominioIds = Array.from(new Set(
    receitasParaExecutar
      .map((receita) => getCondominioId(receita.config_json))
      .filter(Boolean) as string[],
  ))
  const condominiosPorId = new Map<string, { carteira_id: string | null }>()

  if (condominioIds.length) {
    const { data: condominios, error: condominiosError } = await supabase
      .from('condominios')
      .select('id, carteira_id')
      .in('id', condominioIds)

    if (condominiosError) throw new Error(condominiosError.message)
    for (const condominio of condominios ?? []) {
      condominiosPorId.set(condominio.id, { carteira_id: condominio.carteira_id })
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payloads = receitasParaExecutar.map((receita) => {
    const condominioId = getCondominioId(receita.config_json)
    const carteiraId = condominioId ? condominiosPorId.get(condominioId)?.carteira_id ?? receita.carteira_id : receita.carteira_id

    return {
      receita_id: receita.id,
      administradora_id: receita.administradora_id,
      carteira_id: carteiraId,
      condominio_id: condominioId,
      status: 'pendente',
      solicitado_por: user?.id ?? null,
      tentativas: 0,
      origem: `manual_worker:${worker.scriptKey}`,
    }
  })

  const { data: execucoesCriadas, error } = await supabase
    .from('agente_execucoes')
    .insert(payloads)
    .select('id')

  if (error) throw new Error(error.message)

  if (execucoesCriadas?.length) {
    await supabase.from('agente_logs').insert(
      execucoesCriadas.map((execucao) => ({
        execucao_id: execucao.id,
        nivel: 'info',
        step: 'fila',
        mensagem: `Execução criada por acionamento manual do worker ${worker.nome}.`,
      })),
    )
  }

  revalidatePath('/app/agente-automatico')
  revalidatePath('/app/agente-automatico/maestro')
}

export async function alternarCaptacaoGlobal(formData: FormData) {
  const supabase = await createClient()
  const ativo = getString(formData, 'ativo') === 'true'
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuário não autenticado.')
  const { error } = await supabase.from('automacao_controle').upsert({
    chave: 'captacao_global', ativo, atualizado_em: new Date().toISOString(), atualizado_por: user.id,
  }, { onConflict: 'chave' })
  if (error) throw new Error(`Não foi possível ${ativo ? 'ligar' : 'desligar'} a captação: ${error.message}`)
  revalidatePath('/app/agente-automatico/maestro')
}

export async function iniciarAgenteWorkerLocal(formData: FormData) {
  const worker = getScriptKey(formData)
  await startLocalWorker(worker)
  revalidatePath('/app/agente-automatico')
  revalidatePath('/app/agente-automatico/maestro')
}

export async function pararAgenteWorkerLocal(formData: FormData) {
  const worker = getScriptKey(formData)
  await stopLocalWorker(worker)
  revalidatePath('/app/agente-automatico')
  revalidatePath('/app/agente-automatico/maestro')
}

export async function marcarExecucaoComoSucessoManual(formData: FormData) {
  const supabase = await createClient()

  const execucaoId = getString(formData, 'execucao_id')

  if (!execucaoId) throw new Error('Execução não informada.')

  const agora = new Date().toISOString()

  const { error } = await supabase
    .from('agente_execucoes')
    .update({
      status: 'sucesso',
      iniciado_em: agora,
      finalizado_em: agora,
    })
    .eq('id', execucaoId)

  if (error) throw new Error(error.message)

  await supabase.from('agente_logs').insert({
    execucao_id: execucaoId,
    nivel: 'info',
    step: 'validacao_manual',
    mensagem: 'Execução marcada manualmente como sucesso.',
  })

  revalidatePath('/app/agente-automatico')
}

export async function validarArquivoAgente(formData: FormData) {
  const supabase = await createClient()

  const execucaoId = getString(formData, 'execucao_id')
  const status = getString(formData, 'status')
  const observacao = getString(formData, 'observacao')

  if (!execucaoId) throw new Error('Execução não informada.')
  if (!['validado', 'rejeitado', 'reenviar_coleta', 'importado_manual'].includes(status)) {
    throw new Error('Status de validação inválido.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('agente_validacoes').insert({
    execucao_id: execucaoId,
    validado_por: user?.id ?? null,
    status,
    observacao: observacao || null,
  })

  if (error) throw new Error(error.message)

  await supabase.from('agente_logs').insert({
    execucao_id: execucaoId,
    nivel: 'info',
    step: 'validacao_humana',
    mensagem: `Validação registrada: ${status}.`,
  })

  revalidatePath('/app/agente-automatico')
}

export async function limparAgenteExecucoes() {
  const scope = await getPermittedCarteiras()
  const admin = createAdminClient()
  let query = admin.from('agente_execucoes').update({ oculto_em: new Date().toISOString() }).is('oculto_em', null)
  if (scope.carteiraIds !== null) query = query.in('carteira_id', scope.carteiraIds)
  const { error } = await query
  if (error) throw new Error(error.message)

  revalidatePath('/app/agente-automatico')
  revalidatePath('/app/configuracoes/lab/captacao-automatizada')
  revalidatePath('/app/configuracoes/lab/captacao-automatizada/historico')
}
