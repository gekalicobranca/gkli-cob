'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function solicitarPdfs(ids: string[]): Promise<{ mensagem: string; erro?: boolean }> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !/^[\da-f-]{36}$/i.test(id))) return { mensagem: 'Selecione os condomínios para resgatar.', erro: true }
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { mensagem: 'Entre novamente para solicitar o resgate.', erro: true }
  const { data: perfil } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (!perfil || !['admin', 'operador'].includes(perfil.role)) return { mensagem: 'Seu perfil não pode solicitar resgates.', erro: true }
  const { data: configs, error } = await db.from('agente_acordos_configuracoes').select('condominio_id, carteira_id, codigo_cliente').in('condominio_id', [...new Set(ids)]).eq('habilitado', true)
  if (error) return { mensagem: 'Não foi possível consultar os agentes.', erro: true }
  let criados = 0
  let existentes = 0
  let falhas = ids.length - (configs?.length ?? 0)
  for (const config of configs ?? []) {
    const { error: inserir } = await db.from('agente_acordos_execucoes').insert({ ...config, solicitado_por: user.id })
    if (!inserir) criados++
    else if (inserir.code === '23505') existentes++
    else falhas++
  }
  revalidatePath('/app/agente-acordos')
  return { mensagem: `${criados} resgate(s) solicitado(s).${existentes ? ` ${existentes} já estavam na fila.` : ''}${falhas ? ` ${falhas} não puderam ser solicitados; confira o cadastro e seu acesso.` : ''}`, erro: falhas > 0 }
}
