type SupabaseLike = {
  from: (table: string) => any
}

type ResponsavelUnidadeSyncInput = {
  carteiraId: string
  condominioId: string
  unidade: string
  bloco?: string | null
  responsavelNome?: string | null
  responsavelDocumento?: string | null
  telefone?: string | null
  email?: string | null
  ativo?: boolean
}

function cleanText(value: string | null | undefined) {
  return String(value ?? '').trim() || null
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '') || null
}

function hasValue(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function buildContatoPatch(unidade: Record<string, any>, input: ResponsavelUnidadeSyncInput) {
  const patch: Record<string, string> = {}
  const responsavelNome = cleanText(input.responsavelNome)
  const responsavelDocumento = onlyDigits(input.responsavelDocumento)
  const telefone = onlyDigits(input.telefone)
  const email = cleanText(input.email)

  if (!hasValue(unidade.responsavel_nome) && responsavelNome) patch.responsavel_nome = responsavelNome
  if (!hasValue(unidade.responsavel_documento) && responsavelDocumento) {
    patch.responsavel_documento = responsavelDocumento
  }
  if (!hasValue(unidade.telefone) && telefone) patch.telefone = telefone
  if (!hasValue(unidade.email) && email) patch.email = email

  return patch
}

async function findExactUnidade(
  supabase: SupabaseLike,
  condominioId: string,
  identificacao: string,
  bloco: string | null,
) {
  let query = supabase
    .from('unidades')
    .select('id, condominio_id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email')
    .eq('condominio_id', condominioId)
    .eq('identificacao', identificacao)

  query = bloco ? query.eq('bloco', bloco) : query.is('bloco', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Erro ao buscar unidade operacional: ${error.message}`)
  return data as Record<string, any> | null
}

async function findSingleLooseUnidade(
  supabase: SupabaseLike,
  condominioId: string,
  identificacao: string,
) {
  const { data, error } = await supabase
    .from('unidades')
    .select('id, condominio_id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email')
    .eq('condominio_id', condominioId)
    .eq('identificacao', identificacao)
    .limit(2)

  if (error) throw new Error(`Erro ao buscar unidade operacional: ${error.message}`)
  return data?.length === 1 ? (data[0] as Record<string, any>) : null
}

export async function sincronizarResponsavelComUnidadeOperacional(
  supabase: SupabaseLike,
  input: ResponsavelUnidadeSyncInput,
) {
  const carteiraId = cleanText(input.carteiraId)
  const condominioId = cleanText(input.condominioId)
  const identificacao = cleanText(input.unidade)
  const bloco = cleanText(input.bloco)

  if (input.ativo === false || !carteiraId || !condominioId || !identificacao) {
    return { acao: 'ignorada' as const }
  }

  const exacta = await findExactUnidade(supabase, condominioId, identificacao, bloco)
  const unidade = exacta ?? (!bloco ? await findSingleLooseUnidade(supabase, condominioId, identificacao) : null)

  if (unidade) {
    const patch = buildContatoPatch(unidade, input)
    if (Object.keys(patch).length === 0) return { acao: 'sem_alteracao' as const, unidadeId: unidade.id as string }

    const { error } = await supabase.from('unidades').update(patch).eq('id', unidade.id)
    if (error) throw new Error(`Erro ao vincular responsavel a unidade: ${error.message}`)

    return { acao: 'atualizada' as const, unidadeId: unidade.id as string }
  }

  const contato = buildContatoPatch({}, input)
  const { data, error } = await supabase
    .from('unidades')
    .insert({
      carteira_id: carteiraId,
      condominio_id: condominioId,
      identificacao,
      bloco,
      responsavel_nome: contato.responsavel_nome ?? null,
      responsavel_documento: contato.responsavel_documento ?? null,
      telefone: contato.telefone ?? null,
      email: contato.email ?? null,
      status: 'ativa',
      observacoes: 'Criada por importacao/cadastro de responsavel.',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Erro ao criar unidade operacional para responsavel: ${error.message}`)

  return { acao: 'criada' as const, unidadeId: data?.id as string }
}
