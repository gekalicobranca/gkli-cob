import type { createClient } from '@/utils/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export const SANEAMENTO_TIPOS = {
  RESPONSAVEL_DIVERGENTE: 'responsavel_divergente',
  RESPONSAVEL_AUSENTE: 'responsavel_ausente',
  UNIDADE_NAO_ENCONTRADA: 'unidade_nao_encontrada',
  POSSIVEL_CORRESPONDENCIA: 'possivel_correspondencia',
} as const

export type SaneamentoTipo = (typeof SANEAMENTO_TIPOS)[keyof typeof SANEAMENTO_TIPOS]

export const SANEAMENTO_STATUS = {
  PENDENTE: 'pendente',
  RESOLVIDO: 'resolvido',
  IGNORADO: 'ignorado',
} as const

export function normalizeSaneamentoText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeUnidadeComparable(value: unknown) {
  const raw = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase()

  if (!raw) return ''

  const semZeros = raw.replace(/^0+/, '')
  return semZeros || '0'
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function sameResponsavel(a: unknown, b: unknown) {
  const left = normalizeSaneamentoText(a)
  const right = normalizeSaneamentoText(b)
  if (!left || !right) return false
  return left === right
}

export type UnidadeSaneamentoRow = {
  id: string
  carteira_id: string
  condominio_id: string
  identificacao: string
  bloco: string | null
  responsavel_nome: string | null
  responsavel_documento: string | null
  telefone?: string | null
  email?: string | null
}

type RegistrarSaneamentoParams = {
  carteiraId: string
  condominioId: string
  unidadeId?: string | null
  unidadeSugeridaId?: string | null
  cobrancaId?: string | null
  importacaoId?: string | null
  conversaoRelatorioId?: string | null
  tipo: SaneamentoTipo
  unidadeRelatorio: string
  blocoRelatorio?: string | null
  responsavelRelatorio?: string | null
  responsavelDocumentoRelatorio?: string | null
  unidadeCadastro?: string | null
  blocoCadastro?: string | null
  responsavelCadastro?: string | null
  responsavelDocumentoCadastro?: string | null
  scoreSugestao?: number
  payload?: Record<string, unknown>
}

export async function registrarSaneamentoCobranca(
  supabase: SupabaseClient,
  params: RegistrarSaneamentoParams,
) {
  const unidadeRelatorio = String(params.unidadeRelatorio ?? '').trim()
  if (!params.carteiraId || !params.condominioId || !unidadeRelatorio) return null

  const { data: existente, error: existenteError } = await supabase
    .from('saneamento_cobrancas')
    .select('id')
    .eq('tipo', params.tipo)
    .eq('condominio_id', params.condominioId)
    .eq('unidade_relatorio', unidadeRelatorio)
    .eq('status', SANEAMENTO_STATUS.PENDENTE)
    .maybeSingle()

  if (existenteError) {
    // A migration pode ainda não ter sido aplicada em ambientes antigos.
    // Não derruba a importação: o saneamento é uma camada auxiliar.
    console.warn('Falha ao consultar saneamento de cobranças:', existenteError.message)
    return null
  }

  const values = {
    carteira_id: params.carteiraId,
    condominio_id: params.condominioId,
    unidade_id: params.unidadeId || null,
    unidade_sugerida_id: params.unidadeSugeridaId || null,
    cobranca_id: params.cobrancaId || null,
    importacao_id: params.importacaoId || null,
    conversao_relatorio_id: params.conversaoRelatorioId || null,
    tipo: params.tipo,
    status: SANEAMENTO_STATUS.PENDENTE,
    unidade_relatorio: unidadeRelatorio,
    bloco_relatorio: params.blocoRelatorio || null,
    responsavel_relatorio: params.responsavelRelatorio || null,
    responsavel_documento_relatorio: params.responsavelDocumentoRelatorio || null,
    unidade_cadastro: params.unidadeCadastro || null,
    bloco_cadastro: params.blocoCadastro || null,
    responsavel_cadastro: params.responsavelCadastro || null,
    responsavel_documento_cadastro: params.responsavelDocumentoCadastro || null,
    score_sugestao: Math.max(0, Math.min(100, Number(params.scoreSugestao ?? 0))),
    payload: params.payload ?? {},
  }

  if (existente?.id) {
    const { error } = await supabase
      .from('saneamento_cobrancas')
      .update({
        ...values,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)

    if (error) {
      console.warn('Falha ao atualizar saneamento de cobranças:', error.message)
      return null
    }

    return existente.id as string
  }

  const { data, error } = await supabase
    .from('saneamento_cobrancas')
    .insert(values)
    .select('id')
    .single()

  if (error) {
    console.warn('Falha ao registrar saneamento de cobranças:', error.message)
    return null
  }

  return (data as any)?.id as string | null
}

export async function buscarPossivelUnidadePorNormalizacao(
  supabase: SupabaseClient,
  params: { condominioId: string; identificacao: string; bloco?: string | null },
) {
  const alvo = normalizeUnidadeComparable(params.identificacao)
  if (!params.condominioId || !alvo) return null

  const { data, error } = await supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email')
    .eq('condominio_id', params.condominioId)

  if (error) throw new Error(`Erro ao buscar possíveis unidades: ${error.message}`)

  const blocoRelatorio = normalizeSaneamentoText(params.bloco)
  const candidatas = ((data ?? []) as UnidadeSaneamentoRow[]).filter((unidade) => {
    const unidadeCompativel = normalizeUnidadeComparable(unidade.identificacao) === alvo
    if (!unidadeCompativel) return false

    const blocoCadastro = normalizeSaneamentoText(unidade.bloco)
    if (!blocoRelatorio || !blocoCadastro) return true
    return blocoCadastro === blocoRelatorio
  })

  return candidatas[0] ?? null
}

export async function registrarSaneamentosDaCobrancaImportada(
  supabase: SupabaseClient,
  params: {
    payload: Record<string, any>
    unidade: UnidadeSaneamentoRow | null
    unidadeCriada: boolean
    unidadeSugerida?: UnidadeSaneamentoRow | null
    cobrancaId?: string | null
    importacaoId?: string | null
  },
) {
  const { payload, unidade, unidadeCriada, unidadeSugerida, cobrancaId, importacaoId } = params
  const carteiraId = String(payload.carteira_id ?? unidade?.carteira_id ?? '').trim()
  const condominioId = String(payload.condominio_id ?? unidade?.condominio_id ?? '').trim()
  const unidadeRelatorio = String(payload.unidade ?? payload.identificacao ?? '').trim()
  const responsavelRelatorio = String(payload.responsavel_nome ?? '').trim()
  const responsavelDocumentoRelatorio = onlyDigits(payload.responsavel_documento ?? '')

  if (!carteiraId || !condominioId || !unidadeRelatorio) return

  if (unidadeCriada) {
    await registrarSaneamentoCobranca(supabase, {
      carteiraId,
      condominioId,
      unidadeId: unidade?.id ?? null,
      cobrancaId,
      importacaoId,
      tipo: SANEAMENTO_TIPOS.UNIDADE_NAO_ENCONTRADA,
      unidadeRelatorio,
      blocoRelatorio: payload.bloco ?? null,
      responsavelRelatorio: responsavelRelatorio || null,
      responsavelDocumentoRelatorio: responsavelDocumentoRelatorio || null,
      unidadeCadastro: unidade?.identificacao ?? null,
      blocoCadastro: unidade?.bloco ?? null,
      responsavelCadastro: unidade?.responsavel_nome ?? null,
      responsavelDocumentoCadastro: unidade?.responsavel_documento ?? null,
      payload: {
        origem: 'importacao_cobrancas',
        motivo: 'Unidade foi criada automaticamente durante a importação de cobrança.',
      },
    })
  }

  if (unidadeSugerida) {
    await registrarSaneamentoCobranca(supabase, {
      carteiraId,
      condominioId,
      unidadeId: unidade?.id ?? null,
      unidadeSugeridaId: unidadeSugerida.id,
      cobrancaId,
      importacaoId,
      tipo: SANEAMENTO_TIPOS.POSSIVEL_CORRESPONDENCIA,
      unidadeRelatorio,
      blocoRelatorio: payload.bloco ?? null,
      responsavelRelatorio: responsavelRelatorio || null,
      responsavelDocumentoRelatorio: responsavelDocumentoRelatorio || null,
      unidadeCadastro: unidadeSugerida.identificacao,
      blocoCadastro: unidadeSugerida.bloco,
      responsavelCadastro: unidadeSugerida.responsavel_nome,
      responsavelDocumentoCadastro: unidadeSugerida.responsavel_documento,
      scoreSugestao: 92,
      payload: {
        origem: 'importacao_cobrancas',
        motivo: 'Unidade do relatório possui equivalência normalizada com unidade cadastrada.',
      },
    })
  }

  if (!unidade || !responsavelRelatorio) return

  const responsavelCadastro = String(unidade.responsavel_nome ?? '').trim()

  if (!responsavelCadastro) {
    await registrarSaneamentoCobranca(supabase, {
      carteiraId,
      condominioId,
      unidadeId: unidade.id,
      cobrancaId,
      importacaoId,
      tipo: SANEAMENTO_TIPOS.RESPONSAVEL_AUSENTE,
      unidadeRelatorio,
      blocoRelatorio: payload.bloco ?? null,
      responsavelRelatorio,
      responsavelDocumentoRelatorio: responsavelDocumentoRelatorio || null,
      unidadeCadastro: unidade.identificacao,
      blocoCadastro: unidade.bloco,
      responsavelCadastro: null,
      responsavelDocumentoCadastro: unidade.responsavel_documento,
      payload: { origem: 'importacao_cobrancas' },
    })
    return
  }

  if (!sameResponsavel(responsavelCadastro, responsavelRelatorio)) {
    await registrarSaneamentoCobranca(supabase, {
      carteiraId,
      condominioId,
      unidadeId: unidade.id,
      cobrancaId,
      importacaoId,
      tipo: SANEAMENTO_TIPOS.RESPONSAVEL_DIVERGENTE,
      unidadeRelatorio,
      blocoRelatorio: payload.bloco ?? null,
      responsavelRelatorio,
      responsavelDocumentoRelatorio: responsavelDocumentoRelatorio || null,
      unidadeCadastro: unidade.identificacao,
      blocoCadastro: unidade.bloco,
      responsavelCadastro,
      responsavelDocumentoCadastro: unidade.responsavel_documento,
      payload: { origem: 'importacao_cobrancas' },
    })
  }
}
