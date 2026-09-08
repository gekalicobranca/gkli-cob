import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { condominiosPermitidos, selecionarCondominio, type VinculoSindico } from './acesso'

export async function carregarAcessoSindicoV2(solicitado?: string) {
  const session = await createClient()
  const { data: { user }, error: authError } = await session.auth.getUser()
  if (authError || !user) redirect('/sindico/login')

  // O papel deve vir do perfil persistido, não dos metadados editáveis do login.
  const { data: profile, error: profileError } = await session.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profileError) throw new Error('Não foi possível verificar o perfil de acesso.')
  if (profile?.role !== 'sindico') redirect('/app')

  const admin = createAdminClient()
  const { data: portal, error: portalError } = await admin.from('portal_sindico_usuarios')
    .select('id,nome,status').eq('user_id', user.id).maybeSingle()
  if (portalError) throw new Error('Não foi possível verificar o acesso ao portal.')

  const vinculos: VinculoSindico[] = []
  if (portal?.status === 'ativo') {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from('portal_sindico_condominios')
        .select('condominio_id,status,condominios:condominio_id(id,nome)')
        .eq('portal_usuario_id', portal.id).eq('status', 'ativo').order('id')
        .range(offset, offset + 499)
      if (error) throw new Error('Não foi possível carregar os condomínios autorizados.')
      vinculos.push(...(data ?? []) as VinculoSindico[])
      if (!data || data.length < 500) break
    }
  }
  const condominios = condominiosPermitidos(portal?.status ?? 'inativo', vinculos)
  return {
    nome: portal?.nome ?? 'Síndico', condominios,
    selecionado: selecionarCondominio(condominios, solicitado),
    selecaoInvalida: Boolean(solicitado && !condominios.some((item) => item.id === solicitado)),
  }
}
