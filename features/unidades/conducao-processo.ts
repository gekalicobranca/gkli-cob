export const CONDUCAO_PROCESSO = {
  nao_informado: 'Não informado',
  nosso_escritorio: 'Nosso escritório',
  outro_advogado: 'Outro advogado',
} as const

export function validarConducaoProcesso(value: unknown) {
  const key = String(value ?? 'nao_informado').trim()
  if (!Object.prototype.hasOwnProperty.call(CONDUCAO_PROCESSO, key)) throw new Error('Condução do processo inválida.')
  return key as keyof typeof CONDUCAO_PROCESSO
}

export function camposConducaoProcesso(form: FormData): {
  conducao_processo?: keyof typeof CONDUCAO_PROCESSO;
  advogado_externo_nome?: string | null;
  advogado_externo_contato?: string | null;
  acao_judicial?: true;
} {
  if (!form.has('conducao_processo')) return {}
  const conducao_processo = validarConducaoProcesso(form.get('conducao_processo'))
  const nome = String(form.get('advogado_externo_nome') ?? '').trim()
  const contato = String(form.get('advogado_externo_contato') ?? '').trim()
  if (nome.length > 200 || contato.length > 300) throw new Error('Nome ou contato do advogado excede o limite permitido.')
  return { conducao_processo, advogado_externo_nome: nome || null, advogado_externo_contato: contato || null,
    ...(conducao_processo !== 'nao_informado' ? { acao_judicial: true } : {}) }
}

export function filtroConducaoProcesso(value?: string | null) {
  return value ? validarConducaoProcesso(value) : undefined
}
