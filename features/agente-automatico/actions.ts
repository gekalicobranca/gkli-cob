'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === 'on'
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

  const receitaId = getString(formData, 'receita_id')

  if (!receitaId) throw new Error('Receita não informada.')

  const { data: receita, error: receitaError } = await supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('id', receitaId)
    .single()

  if (receitaError) throw new Error(receitaError.message)
  if (!receita) throw new Error('Receita não encontrada.')

  const condominioId = (receita.config_json as Record<string, unknown> | null)?.condominio_id
  let carteiraId = receita.carteira_id
  if (typeof condominioId === 'string' && condominioId) {
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
      condominio_id: typeof condominioId === 'string' && condominioId ? condominioId : null,
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
