import { PORTAL_TIME_ZONE, type PeriodoSindico } from './periodos'

export type RegistroCaptacao = {
  id: string
  condominio_id: string
  status: string
  criado_em: string
  atualizado_em: string
  gerado_em: string | null
  total_unidades: unknown
  valor_total_ranking: unknown
  unidades_ranking: unknown
}

export type UnidadeCaptada = {
  chave: string; bloco: string; unidade: string; situacao: string
  debitoInicial: string; debitoFinal: string; valor: number
}
export type CicloCaptacao = {
  competencia: string
  estado: 'disponivel' | 'indisponivel'
  fonte: 'relatorio' | 'historico'
  referencia: string | null
  motivo: string | null
  unidades: UnidadeCaptada[]
  valor: number | null
  confirmacoes: number
}
export type CaptacaoSindico = {
  estado: 'disponivel' | 'parcial' | 'indisponivel' | 'erro'
  ciclos: CicloCaptacao[]
  ciclosDisponiveis: number
}
export type RegistroCaptacaoHistorica = {
  id: string
  condominio_id: string
  unidade_id: string
  competencia: string
  referencia_em: string | null
  data_entrada: string
  valor: unknown
  debito_descricao: string | null
  debito_inicial: string | null
  debito_final: string | null
  situacao: string | null
  unidade_identificacao: string | null
  bloco: string | null
}

const situacoes = new Set(['Administrativo', 'Extrajudicial', 'Acordo', 'Pré-distribuição', 'Ação judicial em trâmite', 'A classificar'])

export function competenciaDoRegistro(instante: string) {
  const data = new Date(instante)
  if (!Number.isFinite(data.getTime())) return null
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: PORTAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(data)
  const numero = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value)
  const fim = new Date(Date.UTC(numero('year'), numero('month') - 1 + (numero('day') >= 10 ? 1 : 0), 10))
  return `${fim.getUTCFullYear()}-${String(fim.getUTCMonth() + 1).padStart(2, '0')}`
}

function dinheiro(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (value === '') return null
  const numero = Number(value)
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : null
}

function lerUnidades(row: RegistroCaptacao): UnidadeCaptada[] | null {
  if (!Array.isArray(row.unidades_ranking)) return null
  const unidades: UnidadeCaptada[] = []
  const chaves = new Set<string>()
  for (const item of row.unidades_ranking) {
    if (!item || typeof item !== 'object') return null
    const unidade = typeof item.unidade === 'string' ? item.unidade.trim() : ''
    const bloco = typeof item.bloco === 'string' ? item.bloco.trim() : ''
    const centavos = dinheiro(item.valor)
    const chave = JSON.stringify([bloco, unidade])
    if (!unidade || centavos === null || chaves.has(chave)) return null
    chaves.add(chave)
    unidades.push({
      chave, bloco, unidade, valor: centavos / 100,
      situacao: situacoes.has(item.status) ? item.status : 'A classificar',
      debitoInicial: typeof item.debitoInicial === 'string' ? item.debitoInicial : '',
      debitoFinal: typeof item.debitoFinal === 'string' ? item.debitoFinal : '',
    })
  }
  const soma = unidades.reduce((total, item) => total + Math.round(item.valor * 100), 0)
  const total = dinheiro(row.valor_total_ranking)
  if (total === null || total !== soma || row.total_unidades === null || row.total_unidades === undefined || Number(row.total_unidades) !== unidades.length) return null
  return unidades.sort((a, b) => a.bloco.localeCompare(b.bloco, 'pt-BR', { numeric: true }) || a.unidade.localeCompare(b.unidade, 'pt-BR', { numeric: true }))
}

export function montarCaptacao(registros: RegistroCaptacao[], condominioId: string, periodo: PeriodoSindico): CaptacaoSindico {
  const confirmados = registros.filter((row) => row.condominio_id === condominioId && ['concluido', 'concluido_com_alertas'].includes(row.status))
  const ciclos = periodo.competencias.map((competencia): CicloCaptacao => {
    // atualizado_em identifica candidatos e lacunas, nunca prova um fechamento.
    const candidatos = confirmados.filter((row) => competenciaDoRegistro(row.atualizado_em) === competencia)
      .sort((a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em) || b.id.localeCompare(a.id))
    const ultimo = candidatos[0]
    const indisponivel = (motivo: string): CicloCaptacao => ({
      competencia, estado: 'indisponivel', fonte: 'relatorio', referencia: null, motivo, unidades: [], valor: null, confirmacoes: candidatos.length,
    })
    if (!ultimo) return indisponivel('Não há relatório confirmado com histórico disponível neste ciclo.')
    // O ranking é produzido na confirmação. Só aceitar data coerente e dentro do mesmo ciclo.
    const gerado = Date.parse(ultimo.gerado_em ?? '')
    const criado = Date.parse(ultimo.criado_em)
    const atualizado = Date.parse(ultimo.atualizado_em)
    if (!Number.isFinite(gerado) || !Number.isFinite(criado) || gerado < criado || gerado > atualizado || competenciaDoRegistro(ultimo.gerado_em!) !== competencia) {
      return indisponivel('A última confirmação deste ciclo não possui um relatório histórico verificável.')
    }
    const unidades = lerUnidades(ultimo)
    if (!unidades) return indisponivel('O detalhamento do último relatório ainda precisa de conferência.')
    return {
      competencia, estado: 'disponivel', fonte: 'relatorio', referencia: ultimo.gerado_em, motivo: null,
      unidades, valor: unidades.reduce((sum, item) => sum + Math.round(item.valor * 100), 0) / 100,
      confirmacoes: candidatos.length,
    }
  })
  const ciclosDisponiveis = ciclos.filter((ciclo) => ciclo.estado === 'disponivel').length
  return { ciclos, ciclosDisponiveis, estado: !ciclosDisponiveis ? 'indisponivel' : ciclosDisponiveis === ciclos.length ? 'disponivel' : 'parcial' }
}

function montarCicloHistorico(registros: RegistroCaptacaoHistorica[], condominioId: string, competencia: string): CicloCaptacao | null {
  const linhas = registros
    .filter((row) => row.condominio_id === condominioId && row.competencia === competencia)
    .sort((a, b) => String(a.bloco ?? '').localeCompare(String(b.bloco ?? ''), 'pt-BR', { numeric: true }) ||
      String(a.unidade_identificacao ?? '').localeCompare(String(b.unidade_identificacao ?? ''), 'pt-BR', { numeric: true }) ||
      a.id.localeCompare(b.id))
  if (!linhas.length) return null

  const unidades: UnidadeCaptada[] = []
  for (const row of linhas) {
    const centavos = dinheiro(row.valor)
    const unidade = typeof row.unidade_identificacao === 'string' ? row.unidade_identificacao.trim() : ''
    const bloco = typeof row.bloco === 'string' ? row.bloco.trim() : ''
    if (centavos === null || !unidade || !row.unidade_id) return null
    unidades.push({
      chave: row.id,
      bloco,
      unidade,
      valor: centavos / 100,
      situacao: situacoes.has(row.situacao ?? '') ? row.situacao! : 'Histórico conciliado',
      debitoInicial: typeof row.debito_inicial === 'string' ? row.debito_inicial : typeof row.debito_descricao === 'string' ? row.debito_descricao : '',
      debitoFinal: typeof row.debito_final === 'string' ? row.debito_final : '',
    })
  }

  const referencia = linhas
    .map((row) => Date.parse(row.referencia_em || `${row.data_entrada}T12:00:00Z`))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  return {
    competencia,
    estado: 'disponivel',
    fonte: 'historico',
    referencia: Number.isFinite(referencia) ? new Date(referencia).toISOString() : null,
    motivo: null,
    unidades,
    valor: unidades.reduce((sum, item) => sum + Math.round(item.valor * 100), 0) / 100,
    confirmacoes: linhas.length,
  }
}

export function montarCaptacaoComHistorico(
  registros: RegistroCaptacao[],
  historicos: RegistroCaptacaoHistorica[],
  condominioId: string,
  periodo: PeriodoSindico,
): CaptacaoSindico {
  const captacao = montarCaptacao(registros, condominioId, periodo)
  const ciclos = captacao.ciclos.map((ciclo) => {
    if (ciclo.estado === 'disponivel') return ciclo
    return montarCicloHistorico(historicos, condominioId, ciclo.competencia) ?? ciclo
  })
  const ciclosDisponiveis = ciclos.filter((ciclo) => ciclo.estado === 'disponivel').length
  return { ciclos, ciclosDisponiveis, estado: !ciclosDisponiveis ? 'indisponivel' : ciclosDisponiveis === ciclos.length ? 'disponivel' : 'parcial' }
}
