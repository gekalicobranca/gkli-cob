import 'server-only'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import type { AdministradoraEspelhamento } from './espelhamento-prompt'
import { nomeCondominioEasy } from './nome-condominio'

type CondominioCadastrado = {
  id: string
  nome: string
  nome_operacional: string | null
  administradora: string | null
  cadastro_administradora: { nome: string; nome_operacional: string | null } | null
  carteira: { nome: string } | null
}

const ordem = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export async function listarAdministradorasEspelhamento(scope: CarteiraScope) {
  if (scope.carteiraIds?.length === 0) return []

  // O cadastro de administradoras é interno. O escopo de carteira é aplicado antes da leitura.
  const db = createAdminClient()
  const grupos = new Map<string, AdministradoraEspelhamento>()

  for (let offset = 0; ; offset += 500) {
    const query = db.from('condominios')
      .select('id,nome,nome_operacional,administradora,cadastro_administradora:administradora_id(nome,nome_operacional),carteira:carteiras(nome)')
      .eq('status', 'ativo')
    const { data, error } = await applyCarteiraScope(query, scope.carteiraIds)
      .order('nome').order('id').range(offset, offset + 499)
    if (error) throw new Error('Não foi possível carregar os condomínios para o espelhamento.')

    for (const row of data as CondominioCadastrado[]) {
      const cadastro = row.cadastro_administradora
      let nome = (cadastro?.nome_operacional?.trim() || cadastro?.nome || row.administradora || '').trim()
      if (!nome) continue

      let chave = nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').toLowerCase()
      if (chave === 'hubert' || chave.replace(/\s/g, '') === 'hubert/lello') chave = 'lello'
      if (chave === 'lello') nome = 'Lello'

      const grupo = grupos.get(chave) ?? { id: chave, nome, condominios: [] }
      if (cadastro?.nome_operacional) grupo.nome = nome
      grupo.condominios.push({ id: row.id, nome: nomeCondominioEasy(row.nome, row.nome_operacional), carteira: row.carteira?.nome ?? null })
      grupos.set(chave, grupo)
    }

    if (data.length < 500) break
  }

  return [...grupos.values()]
    .map(grupo => ({ ...grupo, condominios: grupo.condominios.sort((a, b) => ordem.compare(a.nome, b.nome)) }))
    .sort((a, b) => ordem.compare(a.nome, b.nome))
}
