import { normalizarTelefone, type TelefoneNormalizado } from '@/lib/core/telefone'

export const TELEFONE_KEYS = ['telefone', 'celular', 'whatsapp', 'cel']
export const SINDICO_CELULAR_KEYS = ['sindico_celular', 'celular_sindico', 'telefone_sindico', 'sindico_telefone']
export const GERENTE_CELULAR_KEYS = ['gerente_celular', 'celular_gerente', 'telefone_gerente', 'gerente_telefone']

type CamposTelefone = Record<string, string[]>

export function normalizarTelefonesImportacao(
  payload: Record<string, any>,
  campos: CamposTelefone,
): Record<string, any> & { telefones_importacao: Record<string, TelefoneNormalizado> } {
  const result: Record<string, any> = { ...payload }
  const anteriores = payload.telefones_importacao ?? {}
  const telefones: Record<string, TelefoneNormalizado> = { ...anteriores }
  for (const [campo, aliases] of Object.entries(campos)) {
    const values = [...new Set(aliases.map(key => String(payload[key] ?? '').trim()).filter(Boolean))]
    const anterior = anteriores[campo] as TelefoneNormalizado | undefined
    const atual = normalizarTelefone(values.join(' | '))
    // Reprocessar o payload da prévia mantém o original, inclusive quando o campo ficou nulo.
    const preservarAnterior = anterior && (
      !values.length || (atual.numero !== null && atual.numero === anterior.numero)
    )
    const analysis = preservarAnterior ? normalizarTelefone(anterior.original) : atual
    telefones[campo] = analysis
    result[campo] = analysis.numero
  }
  return { ...result, telefones_importacao: telefones }
}

export function alertasTelefonesImportacao(payload: Record<string, any>): string[] {
  const labels: Record<string, string> = { telefone: 'Telefone', sindico_celular: 'Celular do síndico', gerente_celular: 'Celular do gerente' }
  return Object.entries(payload.telefones_importacao ?? {}).flatMap(([campo, entry]) => {
    const telefone = entry as TelefoneNormalizado
    if (telefone.motivo === 'vazio' || telefone.motivo === 'valido') return []
    const motivo = telefone.motivo === 'multiplos_contatos'
      ? 'contém múltiplos contatos'
      : telefone.motivo === 'sem_ddd' ? 'sem DDD ou incompleto' : 'DDD, prefixo ou formato inválido'
    return [`${labels[campo] ?? campo}: ${motivo}. Revise o valor original: ${telefone.original}. Esse valor não será usado como telefone; o contato já cadastrado será preservado.`]
  })
}

// Importar um contato vazio/ambíguo não deve apagar o contato atual.
export function telefonesParaAtualizacao(payload: Record<string, any>, campos: string[]) {
  const patch: Record<string, string> = {}
  for (const campo of campos) {
    const numero = normalizarTelefone(payload[campo]).numero
    if (numero) patch[campo] = numero
  }
  return patch
}
