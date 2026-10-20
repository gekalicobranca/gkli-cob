import { competenciaDoRegistro } from './captacao'
import { PORTAL_TIME_ZONE, ultimaCompetenciaFechada, type PeriodoSindico } from './periodos'

type Unidade = { identificacao: string | null; bloco: string | null }
type Base = { id: string; condominio_id: string; unidade_id: string | null; created_at: string; unidades: Unidade | Unidade[] | null }
export type CobrancaSindicoRow = Base & {
  valor_atualizado: number | string | null; valor_original: number | string | null
  status: string | null; status_operacional: string | null; status_financeiro: string | null; vencimento: string | null
}
export type AcordoSindicoRow = Base & {
  data_acordo: string | null; valor_acordado: number | string | null; quantidade_parcelas: number | null
  status: string | null; exige_aprovacao_sindico: boolean; sindico_aprovado_em: string | null
}
export type ParcelaSindicoRow = {
  id: string; acordo_id: string; numero: number; valor: number | string | null; vencimento: string | null
  status: string | null; data_pagamento: string | null
}
export type PendenciaSindicoRow = Base & {
  tipo: string; origem: string; status: string; prioridade: string; prazo_limite: string | null
}
export type ProcuracaoSindicoRow = Base & { procuracao_status: string; etapa: string; prazo_etapa: string | null }
export type FonteOperacao = {
  cobrancas: CobrancaSindicoRow[]; acordos: AcordoSindicoRow[]; parcelas: ParcelaSindicoRow[]
  pendencias: PendenciaSindicoRow[]; procuracoes: ProcuracaoSindicoRow[]
  erros: string[]
}
export type AreaOperacaoSindico = {
  titulo: string; descricao: string; numero: string; aviso: string; erro: boolean
  indicadores: { titulo: string; valor: string }[]
  colunas: string[]; linhas: { id: string; celulas: string[] }[]; vazio: string
}

const moeda = (centavos: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
const centavos = (value: unknown) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0
const data = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—'
const labels: Record<string, string> = {
  novo: 'Nova cobrança', em_cobranca_ativa: 'Em cobrança', em_negociacao: 'Em negociação', possivel_acordo: 'Em negociação',
  pre_distribuicao: 'Pré-distribuição', judicializado: 'Judicializada', suspenso: 'Suspensa',
  acordo_firmado: 'Acordo firmado', acordo_efetivado: 'Acordo firmado', regular: 'Regular',
  ativo: 'Ativo', em_dia: 'Em dia', em_atraso: 'Em atraso', vencido: 'Vencido', quitado: 'Quitado',
  quebrado: 'Rompido', rompido: 'Rompido', cancelado: 'Cancelado', renegociado: 'Renegociado',
  aberta: 'Aberta', vencida: 'Vencida', paga: 'Paga', cancelada: 'Cancelada', em_tratamento: 'Em tratamento',
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica', gerada: 'Aguardando envio', enviada: 'Aguardando assinatura',
}
const label = (value: string | null) => labels[value ?? ''] ?? 'Em acompanhamento'
const acordoAtivo = (row: AcordoSindicoRow) => !['quitado', 'cancelado', 'cancelada', 'rompido', 'quebrado', 'renegociado'].includes(row.status ?? '')
const paga = (row: ParcelaSindicoRow) => !['cancelada', 'cancelado'].includes(row.status ?? '') &&
  (['paga', 'pago', 'quitada', 'quitado'].includes(row.status ?? '') || Boolean(row.data_pagamento))
const aberta = (row: ParcelaSindicoRow) => !paga(row) && !['cancelada', 'cancelado'].includes(row.status ?? '')
function unidade(row: Base) {
  const item = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades
  return item ? [item.bloco && `Bloco ${item.bloco}`, item.identificacao && `Unidade ${item.identificacao}`].filter(Boolean).join(' · ') || 'Unidade não informada' : 'Condomínio'
}
function diaLocal(instante: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PORTAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instante))
}
function noPeriodo(dia: string | null, periodo: PeriodoSindico) {
  if (!dia) return false
  const date = dia.includes('T') ? diaLocal(dia) : dia
  return date >= periodo.inicio && date < periodo.fimExclusivo
}

export function competenciasOperacao(fonte: FonteOperacao, condominioId: string, agora = new Date()) {
  const acordos = fonte.acordos.filter((row) => row.condominio_id === condominioId)
  const ids = new Set(acordos.map((row) => row.id))
  const datas = [
    ...fonte.cobrancas.filter((row) => row.condominio_id === condominioId).map((row) => row.created_at),
    ...acordos.map((row) => row.data_acordo ? `${row.data_acordo}T12:00:00Z` : row.created_at),
    ...fonte.parcelas.filter((row) => ids.has(row.acordo_id) && paga(row) && row.data_pagamento).map((row) => `${row.data_pagamento}T12:00:00Z`),
    ...fonte.pendencias.filter((row) => row.condominio_id === condominioId).map((row) => row.created_at),
    ...fonte.procuracoes.filter((row) => row.condominio_id === condominioId).map((row) => row.created_at),
  ]
  const ultima = ultimaCompetenciaFechada(agora)
  return [...new Set(datas.map(competenciaDoRegistro).filter((item): item is string => Boolean(item && item >= '1900-01' && item <= ultima)))].sort().reverse()
}

export function montarOperacaoSindico(fonte: FonteOperacao, condominioId: string, periodo: PeriodoSindico, agora = new Date()): AreaOperacaoSindico[] {
  const hoje = diaLocal(agora.toISOString())
  const cobrancas = fonte.cobrancas.filter((row) => row.condominio_id === condominioId &&
    !['quitado', 'cancelado', 'baixado', 'regular', 'acordo_efetivado', 'acordo_firmado'].includes(row.status_operacional || row.status || '') &&
    !['quitado', 'pago', 'cancelado', 'baixado'].includes(row.status_financeiro ?? ''))
  const acordos = fonte.acordos.filter((row) => row.condominio_id === condominioId)
  const ativos = acordos.filter(acordoAtivo)
  const ids = new Set(acordos.map((row) => row.id))
  const ativosIds = new Set(ativos.map((row) => row.id))
  const parcelas = fonte.parcelas.filter((row) => ids.has(row.acordo_id))
  const abertas = parcelas.filter((row) => ativosIds.has(row.acordo_id) && aberta(row))
  const negociados = acordos.filter((row) => noPeriodo(row.data_acordo, periodo))
  const recebidas = parcelas.filter((row) => paga(row) && noPeriodo(row.data_pagamento, periodo))
  const valor = (row: CobrancaSindicoRow) => centavos(row.valor_atualizado ?? row.valor_original)
  const avisoAtual = `Situação atual consultada em ${data(hoje)}. Os saldos e status atuais não representam uma posição histórica de fechamento.`
  const atraso = (dia: string | null) => dia && dia < hoje ? Math.floor((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86400000) : 0
  const faixas = (dias: number) => dias === 0 ? 'A vencer' : dias <= 30 ? '1 a 30 dias' : dias <= 60 ? '31 a 60 dias' : dias <= 90 ? '61 a 90 dias' : 'Mais de 90 dias'
  const pendencias = fonte.pendencias.filter((row) => row.condominio_id === condominioId && ['aberta', 'em_tratamento'].includes(row.status))
  const aprovacoes = ativos.filter((row) => row.exige_aprovacao_sindico && !row.sindico_aprovado_em)
  const procuracoes = fonte.procuracoes.filter((row) => row.condominio_id === condominioId && ['gerada', 'enviada'].includes(row.procuracao_status) && !['cancelado', 'cancelada', 'arquivado', 'encerrado'].includes(row.etapa))
  const tiposPendencia: Record<string, string> = {
    emissao_boletos_acordo: 'Emissão de boletos pela administradora', cobranca_aberta_ausente_relatorio: 'Conferência de cobrança no relatório',
    divergencia_relatorio_acordo_vigente: 'Conferência de acordo no relatório', revisao_conciliacao_relatorio: 'Conciliação de relatório',
    validacao_quitacao_planilha: 'Validação de quitação', validacao_acordo_relatorio: 'Validação de acordo',
    aprovacao_acordo_fora_regua: 'Análise das condições do acordo', telefone_sem_whatsapp: 'Atualização de contato da unidade',
  }
  return [
    {
      numero: '02', titulo: 'Cobrança em andamento', descricao: 'Saldo e unidades em acompanhamento na posição atual.',
      aviso: avisoAtual, erro: fonte.erros.includes('cobrancas'),
      indicadores: [
        { titulo: 'Saldo atual em cobrança', valor: moeda(cobrancas.reduce((sum, row) => sum + valor(row), 0)) },
        { titulo: 'Unidades acompanhadas', valor: String(new Set(cobrancas.map((row) => row.unidade_id ?? row.id)).size) },
        { titulo: 'Saldo vencido atual', valor: moeda(cobrancas.filter((row) => atraso(row.vencimento) > 0).reduce((sum, row) => sum + valor(row), 0)) },
      ],
      colunas: ['Unidade', 'Situação atual', 'Vencimento de referência', 'Faixa de atraso atual', 'Saldo atual'],
      linhas: cobrancas.map((row) => ({ id: row.id, celulas: [unidade(row), label(row.status_operacional || row.status), data(row.vencimento), row.vencimento ? faixas(atraso(row.vencimento)) : 'Sem vencimento', moeda(valor(row))] })),
      vazio: 'Nenhuma cobrança em aberto para este condomínio.',
    },
    {
      numero: '03', titulo: 'Acordos', descricao: 'Negociações e pagamentos do período, com posição atual das parcelas.',
      aviso: `${avisoAtual} Negociações e recebimentos consideram de ${data(periodo.inicio)} até ${data(periodo.fimExclusivo)}, sem incluir o dia final. Recebimentos correspondem aos valores das parcelas com pagamento registrado.`,
      erro: fonte.erros.includes('acordos') || fonte.erros.includes('parcelas'),
      indicadores: [
        { titulo: 'Valor negociado no período', valor: moeda(negociados.reduce((sum, row) => sum + centavos(row.valor_acordado), 0)) },
        { titulo: 'Recebimentos registrados no período', valor: moeda(recebidas.reduce((sum, row) => sum + centavos(row.valor), 0)) },
        { titulo: 'Saldo atual de parcelas em aberto', valor: moeda(abertas.reduce((sum, row) => sum + centavos(row.valor), 0)) },
        { titulo: 'Acordos atuais ativos', valor: String(ativos.length) },
        { titulo: 'Acordos firmados no período', valor: String(negociados.length) },
        { titulo: 'Parcelas atualmente vencidas', valor: String(abertas.filter((row) => atraso(row.vencimento) > 0).length) },
      ],
      colunas: ['Unidade', 'Data do acordo', 'Situação atual', 'Valor acordado', 'Recebido no período', 'Saldo atual em parcelas'],
      linhas: acordos.filter((row) => acordoAtivo(row) || negociados.includes(row) || recebidas.some((item) => item.acordo_id === row.id)).map((row) => ({ id: row.id, celulas: [unidade(row), data(row.data_acordo), label(row.status), moeda(centavos(row.valor_acordado)), moeda(recebidas.filter((item) => item.acordo_id === row.id).reduce((sum, item) => sum + centavos(item.valor), 0)), moeda(abertas.filter((item) => item.acordo_id === row.id).reduce((sum, item) => sum + centavos(item.valor), 0))] })),
      vazio: 'Nenhum acordo ativo ou com movimentação neste período.',
    },
    {
      numero: '04', titulo: 'Pendências', descricao: 'Aprovações, procurações e providências em acompanhamento.',
      aviso: `${avisoAtual} A lista reúne as pendências atuais, inclusive as iniciadas fora do período selecionado.`,
      erro: ['pendencias', 'procuracoes', 'acordos'].some((item) => fonte.erros.includes(item)),
      indicadores: [
        { titulo: 'Aprovações do síndico', valor: String(aprovacoes.length) },
        { titulo: 'Procurações aguardando envio ou assinatura', valor: String(procuracoes.length) },
        { titulo: 'Pendências operacionais abertas', valor: String(pendencias.length) },
      ],
      colunas: ['Unidade', 'Pendência', 'Responsável pela próxima ação', 'Situação atual', 'Prazo'],
      linhas: [
        ...aprovacoes.map((row) => ({ id: `aprovacao-${row.id}`, celulas: [unidade(row), 'Aprovação de acordo', 'Síndico', 'Aguardando aprovação', '—'] })),
        ...procuracoes.map((row) => ({ id: `procuracao-${row.id}`, celulas: [unidade(row), 'Procuração', row.procuracao_status === 'enviada' ? 'Síndico' : 'Equipe GKLI', label(row.procuracao_status), data(row.prazo_etapa)] })),
        ...pendencias.map((row) => ({ id: `pendencia-${row.id}`, celulas: [unidade(row), tiposPendencia[row.tipo] ?? 'Providência em acompanhamento', row.origem === 'administradora' ? 'Administradora / equipe GKLI' : 'Equipe GKLI', `${label(row.status)} · prioridade ${label(row.prioridade).toLowerCase()}`, data(row.prazo_limite)] })),
      ],
      vazio: 'Nenhuma pendência aberta para este condomínio.',
    },
  ]
}
