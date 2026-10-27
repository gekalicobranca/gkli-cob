'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'

export async function salvarScanner(form: FormData) {
 const user = await requireUser()
 if (user.perfil !== 'admin') throw Error('Apenas administradores podem configurar o scanner.')
 const db = await createClient()
 const id = String(form.get('condominio_id') || '')
 const codigo = String(form.get('codigo_portal') || '').trim()
 const perfil = String(form.get('perfil_acesso') || '').trim().toUpperCase()
 const unidades = [...new Set(String(form.get('unidades') || '').split(/[\s,;]+/).filter(Boolean))]
 if (!/^\d{1,10}$/.test(codigo) || !/^[A-Z][A-Z0-9_]{0,50}$/.test(perfil) || !unidades.length || unidades.length > 1000 || unidades.some(u => !/^[a-z0-9][a-z0-9-]{0,11}$/i.test(u))) throw Error('Código, perfil ou unidades inválidos.')
 const { data: condo, error: condoErro } = await db.from('condominios').select('id,status,administradora').eq('id', id).single()
 const followConfirmado=condo?.id==='13290a44-ec8d-4232-81e7-711196547f91' && codigo==='62430' && condo.administradora?.toLowerCase()==='hubert/lello'
 if (condoErro || condo?.status !== 'ativo' || (condo.administradora?.toLowerCase() !== 'lello' && !followConfirmado)) throw Error('Selecione um condomínio Lello ativo e confira o código do portal.')
 // Não sobrescreve configurações/cursor de lotes já existentes.
 const { error } = await db.from('scanner_configuracoes').insert({ condominio_id: id, codigo_portal: codigo, perfil_acesso: perfil, unidades, ativo: true })
 if (error) throw Error(error.code === '23505' ? 'Este condomínio já possui scanner cadastrado.' : 'Não foi possível salvar o scanner. Confira a migração.')
 revalidatePath('/app/agente-automatico/scanner')
}

export async function alternarScanner(form: FormData) {
 const user = await requireUser()
 if (user.perfil !== 'admin') throw Error('Apenas administradores podem configurar o scanner.')
 const db = await createClient()
 const ativo = form.get('ativo') === 'true'
 if(ativo){
   const {data:config,error:consultaErro}=await db.from('scanner_configuracoes').select('situacao,unidades').eq('id',String(form.get('id'))).single()
   if(consultaErro||!config.unidades.length||!['validado','aguardando_primeira_coleta'].includes(config.situacao))throw Error('Este condomínio exige configurar o acesso ou validar a integração cadastral antes de ativar.')
 }
 const { error } = await db.from('scanner_configuracoes').update({ ativo, ...(ativo ? { falhas: 0 } : {}), atualizado_em: new Date().toISOString() }).eq('id', String(form.get('id')))
 if (error) throw Error('Não foi possível alterar o scanner.')
 revalidatePath('/app/agente-automatico/scanner')
}
