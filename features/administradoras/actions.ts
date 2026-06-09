'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser } from '@/utils/auth/require-user'

function str(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function bool(formData: FormData, key: string) {
  return formData.get(key) === 'on'
}

function onlyDigits(value: string | null) {
  return value ? value.replace(/\D/g, '') : null
}

export async function createAdministradora(formData: FormData) {
  await requireUser()
  const supabase = createAdminClient()
  const cnpj = onlyDigits(str(formData, 'cnpj'))
  if (!cnpj) throw new Error('Informe o CNPJ da administradora.')
  if (cnpj.length !== 14) throw new Error('Informe um CNPJ válido com 14 dígitos.')

  const payload = {
    nome: str(formData, 'nome'),
    nome_operacional: str(formData, 'nome_operacional') || str(formData, 'nome'),
    cnpj,
    telefone: str(formData, 'telefone'),
    email: str(formData, 'email'),
    site: str(formData, 'site'),
    status: str(formData, 'status') ?? 'ativo',
    acesso_gerar_acordo: bool(formData, 'acesso_gerar_acordo'),
    responsavel_interno: str(formData, 'responsavel_interno'),
    observacoes: str(formData, 'observacoes'),
  }
  if (!payload.nome) throw new Error('Informe o nome da administradora.')
  if (!payload.nome_operacional) payload.nome_operacional = payload.nome
  const { data, error } = await supabase.from('administradoras').insert(payload).select('id').single()
  if (error) throw new Error(`Erro ao criar administradora: ${error.message}`)
  revalidatePath('/app/administradoras')
  redirect(`/app/administradoras/${data.id}`)
}

export async function updateAdministradora(formData: FormData) {
  await requireUser()
  const supabase = createAdminClient()
  const id = str(formData, 'id')
  if (!id) throw new Error('Administradora não informada.')
  const cnpj = onlyDigits(str(formData, 'cnpj'))
  if (!cnpj) throw new Error('Informe o CNPJ da administradora.')
  if (cnpj.length !== 14) throw new Error('Informe um CNPJ válido com 14 dígitos.')

  const payload = {
    nome: str(formData, 'nome'),
    nome_operacional: str(formData, 'nome_operacional') || str(formData, 'nome'),
    cnpj,
    telefone: str(formData, 'telefone'),
    email: str(formData, 'email'),
    site: str(formData, 'site'),
    status: str(formData, 'status') ?? 'ativo',
    acesso_gerar_acordo: bool(formData, 'acesso_gerar_acordo'),
    responsavel_interno: str(formData, 'responsavel_interno'),
    observacoes: str(formData, 'observacoes'),
  }
  if (!payload.nome) throw new Error('Informe o nome da administradora.')
  if (!payload.nome_operacional) payload.nome_operacional = payload.nome
  const { error } = await supabase.from('administradoras').update(payload).eq('id', id)
  if (error) throw new Error(`Erro ao atualizar administradora: ${error.message}`)
  revalidatePath('/app/administradoras')
  revalidatePath(`/app/administradoras/${id}`)
}

export async function createContatoAdministradora(formData: FormData) {
  await requireUser()
  const supabase = createAdminClient()
  const administradora_id = str(formData, 'administradora_id')
  if (!administradora_id) throw new Error('Administradora não informada.')
  const payload = {
    administradora_id,
    nome: str(formData, 'nome'),
    cargo: str(formData, 'cargo'),
    setor: str(formData, 'setor'),
    email: str(formData, 'email'),
    telefone: str(formData, 'telefone'),
    whatsapp: str(formData, 'whatsapp'),
    principal: bool(formData, 'principal'),
    recebe_cobranca: bool(formData, 'recebe_cobranca'),
    recebe_boleto: bool(formData, 'recebe_boleto'),
    recebe_planilha: bool(formData, 'recebe_planilha'),
    ativo: true,
  }
  if (!payload.nome) throw new Error('Informe o nome do contato.')
  const { error } = await supabase.from('administradora_contatos').insert(payload)
  if (error) throw new Error(`Erro ao criar contato da administradora: ${error.message}`)
  revalidatePath(`/app/administradoras/${administradora_id}`)
}

export async function createSolicitacaoAdm(formData: FormData) {
  await requireUser()
  const supabase = createAdminClient()
  const administradora_id = str(formData, 'administradora_id')
  if (!administradora_id) throw new Error('Administradora não informada.')
  const payload = {
    administradora_id,
    contato_id: str(formData, 'contato_id'),
    tipo: str(formData, 'tipo') ?? 'outros',
    status: str(formData, 'status') ?? 'aguardando_resposta',
    prioridade: str(formData, 'prioridade') ?? 'normal',
    canal: str(formData, 'canal') ?? 'email',
    assunto: str(formData, 'assunto'),
    mensagem: str(formData, 'mensagem'),
    prazo_resposta: str(formData, 'prazo_resposta'),
    observacoes: str(formData, 'observacoes'),
  }
  const { data, error } = await supabase.from('solicitacoes_administradora').insert(payload).select('id').single()
  if (error) throw new Error(`Erro ao criar solicitação da administradora: ${error.message}`)
  await supabase.from('logs_operacionais_adm').insert({
    solicitacao_id: data.id,
    status_novo: payload.status,
    descricao: 'Solicitação operacional criada.',
  })
  revalidatePath('/app/administradoras/solicitacoes')
  revalidatePath(`/app/administradoras/${administradora_id}`)
}

export async function resolverSolicitacaoAdm(formData: FormData) {
  await requireUser()
  const supabase = createAdminClient()
  const id = str(formData, 'id')
  const administradoraId = str(formData, 'administradora_id')
  if (!id) throw new Error('Solicitação não informada.')
  const { error } = await supabase
    .from('solicitacoes_administradora')
    .update({ status: 'resolvido', data_resposta: new Date().toISOString(), ultima_interacao_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao resolver solicitação da administradora: ${error.message}`)
  await supabase.from('logs_operacionais_adm').insert({
    solicitacao_id: id,
    status_novo: 'resolvido',
    descricao: 'Solicitação marcada como resolvida.',
  })
  revalidatePath('/app/administradoras/solicitacoes')
  if (administradoraId) revalidatePath(`/app/administradoras/${administradoraId}`)
}
