import type { RankingMensalCaptacao } from './ranking-mensal'

type SupabaseLike = {
  from: (table: string) => any
}

const TIME_ZONE = 'America/Sao_Paulo'

function normalizar(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function chaveUnidade(bloco: unknown, unidade: unknown) {
  return `${normalizar(bloco)}::${normalizar(unidade).replace(/^0+(?=\d)/, '')}`
}

function partesSaoPaulo(instante: string | Date) {
  const data = typeof instante === 'string' ? new Date(instante) : instante
  if (!Number.isFinite(data.getTime())) return null
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data)
  const numero = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value)
  return { year: numero('year'), month: numero('month'), day: numero('day') }
}

export function competenciaFechamentoCaptacao(instante: string | Date) {
  const partes = partesSaoPaulo(instante)
  if (!partes) return null
  const fim = new Date(Date.UTC(partes.year, partes.month - 1 + (partes.day >= 10 ? 1 : 0), 10))
  return `${fim.getUTCFullYear()}-${String(fim.getUTCMonth() + 1).padStart(2, '0')}`
}

function dataCivilSaoPaulo(instante: string | Date) {
  const partes = partesSaoPaulo(instante)
  if (!partes) return null
  return `${partes.year}-${String(partes.month).padStart(2, '0')}-${String(partes.day).padStart(2, '0')}`
}

function roundMoney(value: unknown) {
  const numero = Number(value ?? 0)
  return Number.isFinite(numero) && numero >= 0 ? Math.round((numero + Number.EPSILON) * 100) / 100 : null
}

export async function persistirCaptacaoHistoricaSindico(
  supabase: SupabaseLike,
  params: {
    conversaoId: string
    condominioId: string
    carteiraId: string
    ranking: RankingMensalCaptacao | null | undefined
  },
) {
  const ranking = params.ranking
  if (!ranking?.unidades?.length) return { inseridas: 0, retidas: 0 }

  const referencia = ranking.geradoEm || new Date().toISOString()
  const competencia = competenciaFechamentoCaptacao(referencia)
  const dataEntrada = dataCivilSaoPaulo(referencia)
  if (!competencia || !dataEntrada) return { inseridas: 0, retidas: ranking.unidades.length }

  const { data: unidades, error: unidadesError } = await supabase
    .from('unidades')
    .select('id, identificacao, bloco')
    .eq('condominio_id', params.condominioId)

  if (unidadesError) {
    throw new Error(`Erro ao gravar histórico da captação: ${unidadesError.message}`)
  }

  const unidadeByKey = new Map<string, any[]>()
  for (const unidade of unidades ?? []) {
    const key = chaveUnidade(unidade.bloco, unidade.identificacao)
    const list = unidadeByKey.get(key) ?? []
    list.push(unidade)
    unidadeByKey.set(key, list)
  }

  const payload = []
  let retidas = 0
  for (const item of ranking.unidades) {
    const unidadeMatches = unidadeByKey.get(chaveUnidade(item.bloco, item.unidade)) ?? []
    const valor = roundMoney(item.valor)
    if (unidadeMatches.length !== 1 || valor === null) {
      retidas += 1
      continue
    }
    const itemKey = chaveUnidade(item.bloco, item.unidade)
    payload.push({
      origem: 'conversao_relatorio',
      conversao_relatorio_id: params.conversaoId,
      item_key: itemKey,
      fonte_arquivo: ranking.arquivoOrigem || 'captacao',
      fonte_aba: 'rankingMensal',
      fonte_linha: null,
      condominio_id: params.condominioId,
      carteira_id: params.carteiraId,
      unidade_id: unidadeMatches[0].id,
      competencia,
      referencia_em: referencia,
      data_entrada: dataEntrada,
      valor,
      valor_principal: roundMoney(item.valorPrincipal),
      multa: roundMoney(item.multa),
      correcao: roundMoney(item.correcao),
      juros: roundMoney(item.juros),
      debito_descricao: [item.debitoInicial, item.debitoFinal].filter(Boolean).join(' até ') || null,
      debito_inicial: item.debitoInicial || null,
      debito_final: item.debitoFinal || null,
      situacao: item.status,
      unidade_identificacao: item.unidade,
      bloco: item.bloco || null,
      metadata: {
        recibos: item.recibos,
        marcadoresOrigem: item.marcadoresOrigem,
        situacoesOrigem: item.situacoesOrigem,
      },
    })
  }

  if (!payload.length) return { inseridas: 0, retidas }

  const { error } = await supabase
    .from('captacao_historica_sindico')
    .upsert(payload as any, { onConflict: 'conversao_relatorio_id,item_key' })

  if (error) {
    throw new Error(`Erro ao gravar histórico da captação: ${error.message}`)
  }

  return { inseridas: payload.length, retidas }
}
