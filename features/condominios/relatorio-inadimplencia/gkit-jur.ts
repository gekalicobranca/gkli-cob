import { ContextoRelatorio, normalizar } from './modelo'

export type GkitJurFonteRelatorio = {
  tipo?: string | null
  nome?: string | null
  url?: string | null
  consultadoEm?: string | null
  observacao?: string | null
}

export type GkitJurMovimentacaoRelatorio = {
  data?: string | null
  titulo?: string | null
  descricao?: string | null
  fonte?: string | null
}

export type GkitJurProcessoRelatorio = {
  processoId: string
  numeroCnj: string
  numeroCnjLimpo: string
  titulo: string | null
  tribunal: string | null
  sistema: string | null
  grau: string | null
  foroOrgao: string | null
  classe: string | null
  assuntos: string[]
  dataAjuizamento: string | null
  classificacaoRelatorio: 'cobranca_execucao' | 'demais_processos'
  naturezaOperacional: string
  poloCondominio: 'autor' | 'reu' | 'terceiro' | 'nao_confirmado'
  situacaoProcessual: 'em_andamento' | 'suspenso' | 'encerrado' | 'nao_confirmada'
  partesContrarias: Array<{ nome: string; documento: string | null; papel: string | null }>
  unidades: Array<{ bloco: string | null; unidade: string | null; nivelVinculo: 'nominal' | 'unidade_identificada' | 'debito_identificado'; observacao: string | null }>
  debitosCobrados: Array<{ recibo: string | null; competencia: string | null; vencimento: string | null; valor: number | null; fonte: string }>
  escritorio: {
    tipo: 'genske_advogados' | 'outro_escritorio' | 'nao_identificado' | 'multiplo'
    nomeAtual: string | null
    advogados: Array<{ nome: string; oab: string | null; representacao: 'atual' | 'anterior' | 'nao_confirmada' }>
  }
  resumo: {
    nivelProntidao: string
    resumoOperacional: string | null
    faseProcessual: string | null
    pendenciasIdentificadas: string[]
    proximasAcoesSugeridas: string[]
    riscosAlertas: string[]
    baseSincronizacaoEm: string | null
    geradoEm: string | null
  } | null
  ultimaMovimentacao: GkitJurMovimentacaoRelatorio | null
  movimentacoesPeriodo: GkitJurMovimentacaoRelatorio[]
  pendencias: Array<{ id: string; tipo: string; titulo: string; status: string; prioridade: string; prazoAt: string | null }>
  valorAcao: number | null
  tipoAcompanhamento: string
  incluirRelatorioMensal: boolean
  statusProcesso: string
  statusMonitoramento: string
  marcacaoAutomaticaPermitida: boolean
  observacoesLimitacoes: string[]
  alertas: string[]
  fontes: GkitJurFonteRelatorio[]
}

export type GkitJurPreJuridicoRelatorio = {
  id: string
  titulo: string
  descricao: string
  origem: string | null
  area: string | null
  unidade: string | null
  bloco: string | null
  responsavelUnidade: string | null
  valorEstimado: number | null
  probabilidade: string
  prioridade: string
  status: string
  motivoStatus: string | null
  dataEntrada: string | null
  prontoDistribuicaoEm: string | null
  documentos: Record<string, string | null>
  cotasDebito: Array<{ recibo: string | null; competencia: string | null; vencimento: string | null; valor: number | null; fonte: string }>
  alertas: string[]
}

export type GkitJurRelatorioInadimplencia = {
  contratoVersao: 'jur-report-v1'
  consultaProcessualEm: string
  cliente: { id: string; nome: string; cnpj: string | null } | null
  filtros: {
    clienteId: string | null
    cnpj: string | null
    competencia: string
    dataInicio: string
    dataFimExclusive: string
    movimentosLimitPorProcesso: number
  }
  processos: {
    cobrancasExecucoes: GkitJurProcessoRelatorio[]
    demaisProcessos: GkitJurProcessoRelatorio[]
    todos: GkitJurProcessoRelatorio[]
  }
  preJuridicos: GkitJurPreJuridicoRelatorio[]
  fontes: GkitJurFonteRelatorio[]
  alertas: string[]
}

export type SnapshotJuridicoRelatorio =
  | {
    jurConsultaStatus: 'sucesso'
    contratoVersao: 'jur-report-v1'
    consultadoEm: string
    cnpjConsultado: string
    competencia: string
    response: GkitJurRelatorioInadimplencia
  }
  | {
    jurConsultaStatus: 'erro'
    jurErro: string
    jurConsultadoEm: string
    cnpjConsultado: string
    competencia: string
  }

type FetchInput = {
  cnpj: string
  competencia: string
  dataInicio?: string
  dataFim?: string
  movimentosLimitPorProcesso?: number
}

export function competenciaDaDataBase(dataBase: string | null | undefined) {
  const value = String(dataBase ?? '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7)
}

export async function fetchGkitJurRelatorioInadimplencia(input: FetchInput) {
  const baseUrl = process.env.GKIT_CORE_BASE_URL?.trim()
  const token = process.env.GKIT_JUR_REPORT_API_TOKEN?.trim()
  if (!baseUrl || /[<>]/.test(baseUrl)) throw new Error('Configure GKIT_CORE_BASE_URL com o endereço operacional do GKIT-Jur.')
  let origem: URL
  try { origem = new URL(baseUrl) } catch { throw new Error('GKIT_CORE_BASE_URL não contém um endereço válido.') }
  if (!['https:', 'http:'].includes(origem.protocol) || origem.username || origem.password) {
    throw new Error('GKIT_CORE_BASE_URL deve ser um endereço HTTP ou HTTPS sem credenciais na URL.')
  }
  if (!token || /[<>]|token[-_ ]?(aqui|exemplo)|seu[-_ ]?token|your[-_ ]?token|change.?me/i.test(token)) {
    throw new Error('Configure GKIT_JUR_REPORT_API_TOKEN com a credencial operacional do GKIT-Jur.')
  }

  const url = new URL('/api/gkit-jur/relatorios/inadimplencia/processos', origem)
  url.searchParams.set('cnpj', input.cnpj)
  url.searchParams.set('competencia', input.competencia)
  if (input.dataInicio) url.searchParams.set('data_inicio', input.dataInicio)
  if (input.dataFim) url.searchParams.set('data_fim', input.dataFim)
  if (input.movimentosLimitPorProcesso) url.searchParams.set('movimentos_limit_por_processo', String(input.movimentosLimitPorProcesso))

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
    redirect: 'error',
  })
  const payload = await response.json().catch(() => null)

  if (response.status === 401 || response.status === 403) {
    throw new Error(`GKIT-Jur recusou a credencial da integração (HTTP ${response.status}).`)
  }
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Falha ao consultar GKIT-Jur: HTTP ${response.status}`)
  }
  if (payload.data?.contratoVersao !== 'jur-report-v1') {
    throw new Error('Contrato GKIT-Jur inesperado.')
  }
  return payload.data as GkitJurRelatorioInadimplencia
}

export function snapshotErroGkitJur(input: { cnpj: string; competencia: string; erro: string }): Extract<SnapshotJuridicoRelatorio, { jurConsultaStatus: 'erro' }> {
  return {
    jurConsultaStatus: 'erro',
    jurErro: input.erro,
    jurConsultadoEm: new Date().toISOString(),
    cnpjConsultado: input.cnpj,
    competencia: input.competencia,
  }
}

export function snapshotSucessoGkitJur(input: { cnpj: string; competencia: string; response: GkitJurRelatorioInadimplencia }): Extract<SnapshotJuridicoRelatorio, { jurConsultaStatus: 'sucesso' }> {
  return {
    jurConsultaStatus: 'sucesso',
    contratoVersao: 'jur-report-v1',
    consultadoEm: new Date().toISOString(),
    cnpjConsultado: input.cnpj,
    competencia: input.competencia,
    response: input.response,
  }
}

function join(values: Array<string | null | undefined>, fallback = '') {
  const out = values.map(v => String(v ?? '').trim()).filter(Boolean)
  return out.length ? [...new Set(out)].join('; ') : fallback
}

function situacao(value: GkitJurProcessoRelatorio['situacaoProcessual']) {
  if (value === 'em_andamento') return 'Em andamento'
  if (value === 'suspenso') return 'Suspenso'
  if (value === 'encerrado') return 'Encerrado'
  return 'Não confirmada'
}

function polo(value: GkitJurProcessoRelatorio['poloCondominio']) {
  if (value === 'autor') return 'Autor'
  if (value === 'reu') return 'Réu'
  if (value === 'terceiro') return 'Terceiro'
  return 'Não confirmado'
}

function escritorioNome(processo: GkitJurProcessoRelatorio) {
  if (processo.escritorio.nomeAtual) return processo.escritorio.nomeAtual
  if (processo.escritorio.tipo === 'genske_advogados') return 'Genske Advogados'
  if (processo.escritorio.tipo === 'outro_escritorio') return 'Outro escritório'
  if (processo.escritorio.tipo === 'multiplo') return 'Múltiplos escritórios'
  return 'Não identificado'
}

function fonteTexto(fontes: GkitJurFonteRelatorio[]) {
  return fontes.map(f => [f.nome, f.tipo, f.url].filter(Boolean).join(' - ')).filter(Boolean).join('; ')
}

function processoParaContexto(processo: GkitJurProcessoRelatorio, cobrancaPropria: boolean): NonNullable<ContextoRelatorio['processos']>[number] {
  const unidadesValidas = processo.unidades.filter(u => {
    const valor = String(u.unidade ?? '').trim()
    return valor.length > 0 && valor.length <= 40 && !/unidade judicial|providência|remessa|oficial de justiça/i.test(valor)
  })
  const unidade = unidadesValidas.find(u => u.nivelVinculo === 'debito_identificado')
    ?? unidadesValidas.find(u => u.nivelVinculo === 'unidade_identificada')
    ?? unidadesValidas[0]
  const observacoes = [
    processo.resumo?.resumoOperacional,
    processo.resumo?.faseProcessual ? `Fase: ${processo.resumo.faseProcessual}` : null,
    processo.ultimaMovimentacao ? `Última movimentação: ${processo.ultimaMovimentacao.data ?? 'sem data'} - ${processo.ultimaMovimentacao.titulo ?? processo.ultimaMovimentacao.descricao ?? ''}` : null,
    processo.valorAcao !== null ? `Valor da ação informado pelo Jur: ${processo.valorAcao}. Não somar ao saldo financeiro.` : null,
    processo.observacoesLimitacoes?.length ? `Limitações: ${processo.observacoesLimitacoes.join('; ')}` : null,
    processo.alertas?.length ? `Alertas: ${processo.alertas.join('; ')}` : null,
    unidadesValidas.length !== processo.unidades.length ? 'Identificação de unidade inválida na origem jurídica; vínculo descartado até conferência.' : null,
    processo.marcacaoAutomaticaPermitida === false ? 'Jur indicou marcacaoAutomaticaPermitida=false; não marcar todo o saldo da unidade como judicializado.' : null,
  ].filter(Boolean).join('\n')

  return {
    numero: processo.numeroCnj || processo.numeroCnjLimpo,
    parte: join(processo.partesContrarias.map(p => p.nome), processo.titulo ?? ''),
    unidade: unidade?.unidade ?? '',
    bloco: unidade?.bloco ?? '',
    unidadeConfirmada: Boolean(unidade && unidade.nivelVinculo !== 'nominal'),
    classe: processo.classe ?? processo.naturezaOperacional,
    assunto: join(processo.assuntos),
    polo: polo(processo.poloCondominio),
    situacao: situacao(processo.situacaoProcessual),
    advogado: join(processo.escritorio.advogados.map(a => a.nome)),
    escritorio: escritorioNome(processo),
    origem: 'GKIT-Jur',
    fonte: fonteTexto(processo.fontes),
    observacoes,
    cobrancaPropria,
    marcacaoAutomaticaPermitida: processo.marcacaoAutomaticaPermitida,
    debitosCobrados: processo.debitosCobrados,
  }
}

export function contextoFromGkitJurSnapshot(snapshot: SnapshotJuridicoRelatorio): ContextoRelatorio {
  if (snapshot.jurConsultaStatus === 'erro') {
    return {
      jurConsulta: {
        status: 'erro',
        consultadoEm: snapshot.jurConsultadoEm,
        cnpjConsultado: snapshot.cnpjConsultado,
        competencia: snapshot.competencia,
        erro: snapshot.jurErro,
      },
      jurSnapshot: snapshot,
      fontes: ['GKIT-Jur: consulta processual indisponível. O relatório financeiro não deve afirmar ausência de processo.'],
    }
  }
  const response = snapshot.response
  const cobrancas = response.processos.cobrancasExecucoes.map(p => processoParaContexto(p, true))
  const demais = response.processos.demaisProcessos.map(p => processoParaContexto(p, false))
  return {
    processos: [...cobrancas, ...demais],
    preJuridico: response.preJuridicos.map(item => ({
      bloco: item.bloco ?? '',
      unidade: item.unidade ?? '',
      responsavel: item.responsavelUnidade ?? '',
      situacao: [item.status, item.motivoStatus].filter(Boolean).join(' - '),
      origem: 'GKIT-Jur pré-distribuição',
    })),
    fontes: [
      `GKIT-Jur: consulta processual em ${response.consultaProcessualEm}. Competência ${response.filtros.competencia}.`,
      ...response.fontes.map(f => `GKIT-Jur fonte: ${[f.nome, f.tipo, f.url].filter(Boolean).join(' - ')}`),
      ...response.alertas.map(a => `GKIT-Jur alerta: ${a}`),
    ],
    atualizadoEm: snapshot.consultadoEm,
    jurConsulta: {
      status: 'sucesso',
      contratoVersao: 'jur-report-v1',
      consultadoEm: snapshot.consultadoEm,
      consultaProcessualEm: response.consultaProcessualEm,
      cnpjConsultado: snapshot.cnpjConsultado,
      competencia: snapshot.competencia,
      alertas: response.alertas,
    },
    jurSnapshot: snapshot,
  }
}

export function temMesmoCnpjDoJur(response: GkitJurRelatorioInadimplencia, cnpj: string) {
  const esperado = String(cnpj ?? '').replace(/\D/g, '')
  const recebido = String(response.cliente?.cnpj ?? response.filtros.cnpj ?? '').replace(/\D/g, '')
  return !esperado || !recebido || esperado === recebido
}

export function descricaoLimitacaoJur(contexto: ContextoRelatorio) {
  if (contexto.jurConsulta?.status === 'erro') return `Consulta processual indisponível: ${contexto.jurConsulta.erro}`
  if (contexto.jurConsulta?.status === 'sucesso') {
    const alertas = contexto.jurConsulta.alertas?.filter(Boolean) ?? []
    return alertas.length ? `Alertas do Jur: ${alertas.map(a => normalizar(a).toLowerCase()).join('; ')}` : null
  }
  return null
}
