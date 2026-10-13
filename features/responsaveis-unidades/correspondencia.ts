/** Carrega todo o recorte, sem perder contatos pelo limite padrão da API. */
export async function carregarApoiosParaCorrespondencia(db: { from: (table: string) => any }, condominios: string[]) {
  const rows: any[] = []
  const ids = [...new Set(condominios.filter(Boolean))]
  for (let start = 0; start < ids.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('responsaveis_unidades')
        .select('id,condominio_id,carteira_id,unidade,bloco,responsavel_nome,responsavel_documento,telefone,celular,telefone_fixo,telefone_outros,email,tipo_responsavel')
        .eq('ativo', true).in('condominio_id', ids.slice(start, start + 100)).order('id').range(offset, offset + 499)
      if (error) throw new Error(`Erro ao carregar responsáveis para correspondência: ${error.message}`)
      rows.push(...(data ?? []))
      if ((data ?? []).length < 500) break
    }
  }
  return rows
}

export async function carregarUnidadesParaCorrespondencia(db: { from: (table: string) => any }, condominioId: string) {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('unidades')
      .select('id,carteira_id,condominio_id,identificacao,bloco,responsavel_nome,responsavel_documento,telefone,email')
      .eq('condominio_id', condominioId).order('id').range(offset, offset + 499)
    if (error) throw new Error(`Erro ao carregar unidades para correspondência: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) return rows
  }
}
