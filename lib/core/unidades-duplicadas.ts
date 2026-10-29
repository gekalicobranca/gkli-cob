import { identidade, resolverCorrespondenciasUnidade, type IdentidadeUnidade } from './identidade-unidade'

type Responsavel = { responsavel_nome?: unknown; responsavel_documento?: unknown }
export type ClassificacaoResponsavel = 'mesmo' | 'diferentes' | 'insuficientes'
export const RESPONSAVEL_LABELS: Record<ClassificacaoResponsavel, string> = {
  mesmo: 'Mesmo responsável', diferentes: 'Responsáveis diferentes', insuficientes: 'Dados insuficientes',
}
export type ComparacaoResponsavel = {
  classificacao: ClassificacaoResponsavel
  motivo: string
  nome: 'igual' | 'diferente' | 'incompleto'
  documento: 'igual' | 'diferente' | 'incompleto'
}

function nomeComparavel(value: unknown) {
  const nome = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  if (['', 'NAO INFORMADO', 'RESPONSAVEL NAO INFORMADO', 'SEM RESPONSAVEL', 'NA', 'N A'].includes(nome)) return ''
  return nome
}

function documentoComparavel(value: unknown) {
  const raw = String(value ?? '').trim()
  // Apenas máscaras são ignoradas; texto, múltiplos documentos e números parciais não são evidência.
  if (!/^[\d.\s/()-]+$/.test(raw)) return ''
  const digits = raw.replace(/\D/g, '')
  return /^(?:\d{11}|\d{14})$/.test(digits) && !/^(\d)\1+$/.test(digits) ? digits : ''
}

/** Compara o responsável cadastrado. Documento completo prevalece sobre o nome. */
export function compararResponsaveis(a: Responsavel, b: Responsavel): ComparacaoResponsavel {
  const nomeA = nomeComparavel(a.responsavel_nome), nomeB = nomeComparavel(b.responsavel_nome)
  const docA = documentoComparavel(a.responsavel_documento), docB = documentoComparavel(b.responsavel_documento)
  const nome = !nomeA || !nomeB ? 'incompleto' : nomeA === nomeB ? 'igual' : 'diferente'
  const documento = !docA || !docB ? 'incompleto' : docA === docB ? 'igual' : 'diferente'
  if (documento === 'igual') return { classificacao: 'mesmo', nome, documento, motivo: nome === 'diferente' ? 'CPF/CNPJ igual, mas nomes divergentes. Confira o nome cadastrado.' : 'CPF/CNPJ igual nos dois cadastros.' }
  if (documento === 'diferente') return { classificacao: 'diferentes', nome, documento, motivo: nome === 'igual' ? 'CPF/CNPJ diferentes, apesar do mesmo nome. Revisão necessária.' : 'CPF/CNPJ diferentes nos dois cadastros.' }
  if (nome === 'igual') return { classificacao: 'mesmo', nome, documento, motivo: 'Nome igual após normalização. CPF/CNPJ ausente ou incompleto; correspondência somente por nome, sujeita a homônimos.' }
  if (nome === 'diferente') return { classificacao: 'diferentes', nome, documento, motivo: 'Nomes diferentes. CPF/CNPJ ausente ou incompleto; pode haver abreviação ou alteração cadastral. Revise antes de concluir.' }
  return { classificacao: 'insuficientes', nome, documento, motivo: 'Faltam nomes ou CPF/CNPJ completos nos dois cadastros para comparar o responsável.' }
}

/** Compara somente candidatos com a mesma identidade completa e condomínio. */
export function buscarUnidadesDuplicadas<T extends IdentidadeUnidade & Responsavel & { id: string }>(rows: T[]) {
  const buckets = new Map<string, T[]>()
  for (const row of rows) {
    const key = identidade(row)
    if (!row.condominio_id || !key.unidade) continue
    const bucketKey = JSON.stringify([row.condominio_id, key.completa])
    const bucket = buckets.get(bucketKey) ?? []
    bucket.push(row)
    buckets.set(bucketKey, bucket)
  }
  const pares: Array<{ a: T; b: T; motivo: string; responsavel: ComparacaoResponsavel }> = []
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    for (let i = 0; i < bucket.length; i++) {
      const a = bucket[i]
      const matches = resolverCorrespondenciasUnidade(a, bucket).correspondencias
      for (let j = i + 1; j < bucket.length; j++) {
        const b = bucket[j]
        if (a.id === b.id || !matches.includes(b)) continue
        pares.push({ a, b, motivo: 'Mesmo condomínio e identidade da unidade, considerando máscaras, zeros e aliases de bloco.', responsavel: compararResponsaveis(a, b) })
      }
    }
  }
  return pares
}
