import { garantirUnidadeImportacao } from '../unidades/importacao'

type SupabaseLike = Parameters<typeof garantirUnidadeImportacao>[0]

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


const cleanText = (value?: string | null) => String(value ?? '').trim() || null
const onlyDigits = (value?: string | null) => String(value ?? '').replace(/\D/g, '') || null

export async function sincronizarResponsavelComUnidadeOperacional(db: SupabaseLike, input: ResponsavelUnidadeSyncInput) {
  const carteiraId = cleanText(input.carteiraId), condominioId = cleanText(input.condominioId), identificacao = cleanText(input.unidade)
  if (input.ativo === false || !carteiraId || !condominioId || !identificacao) return { acao: 'ignorada' as const }
  const result = await garantirUnidadeImportacao(db, {
    carteira_id: carteiraId,
    condominio_id: condominioId,
    identificacao,
    bloco: cleanText(input.bloco),
    responsavel_nome: cleanText(input.responsavelNome),
    responsavel_documento: onlyDigits(input.responsavelDocumento),
    telefone: onlyDigits(input.telefone),
    email: cleanText(input.email),
    observacoes_criacao: 'Criada por importação/cadastro de responsável.',
  })
  return { acao: result.criada ? 'criada' as const : 'sem_alteracao' as const, unidadeId: result.id }
}
