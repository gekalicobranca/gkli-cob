type ImportacaoUnidadeInput = {
  carteira_id: string
  condominio_id: string
  identificacao?: string
  unidade?: string
  bloco?: string | null
  unidade_id?: string | null
  responsavel_nome?: string | null
  responsavel_documento?: string | null
  telefone?: string | null
  email?: string | null
  observacoes_criacao?: string
}

type ImportacaoClient = {
  rpc: (name: string, args: { p_payload: ImportacaoUnidadeInput }) => PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

/** O banco resolve novamente a identidade sob lock, inclusive IDs de prévias antigas. */
export async function garantirUnidadeImportacao(db: ImportacaoClient, payload: ImportacaoUnidadeInput) {
  const { data, error } = await db.rpc('garantir_unidade_importacao', { p_payload: payload })
  if (error) throw new Error(`Erro ao resolver unidade da importação: ${error.message}`)
  const result = data as { id?: unknown; criada?: unknown; reutilizada?: unknown } | null
  if (typeof result?.id !== 'string' || typeof result.criada !== 'boolean' || result.reutilizada !== !result.criada) {
    throw new Error('Resposta inválida ao resolver unidade da importação.')
  }
  return { id: result.id, criada: result.criada, reutilizada: !result.criada }
}
