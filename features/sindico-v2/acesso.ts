export type VinculoSindico = {
  condominio_id: string
  status: string
  condominios: { id: string; nome: string } | { id: string; nome: string }[] | null
}

export function condominiosPermitidos(statusUsuario: string, vinculos: VinculoSindico[]) {
  if (statusUsuario !== 'ativo') return []
  const unicos = new Map<string, { id: string; nome: string }>()
  for (const vinculo of vinculos) {
    const condominio = Array.isArray(vinculo.condominios) ? vinculo.condominios[0] : vinculo.condominios
    if (vinculo.status !== 'ativo' || !condominio || condominio.id !== vinculo.condominio_id) continue
    unicos.set(condominio.id, { id: condominio.id, nome: condominio.nome || 'Condomínio sem nome' })
  }
  return [...unicos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function selecionarCondominio<T extends { id: string }>(permitidos: T[], solicitado?: string) {
  // Uma seleção explícita inválida nunca é substituída por outro condomínio.
  return solicitado ? permitidos.find((item) => item.id === solicitado) ?? null : permitidos[0] ?? null
}
