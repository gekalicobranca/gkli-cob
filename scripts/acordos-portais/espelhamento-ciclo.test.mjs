import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmarRepassesLello, planejarEspelhoLello } from './espelhamento-conciliar.mjs'
import { coletarEtapaLello } from './espelhamento-lello.mjs'
import { completarFinanceiro } from './espelhamento-portais.mjs'

const unidade = { id: 'u', identificacao: '400038', bloco: '0', responsavel_nome: 'Titular', email: 'antes@example.org' }
const acordo = { id: 'a', unidade_id: 'u', origem_controle: 'carteira', status: 'quitado', valor_acordado: 971.36,
  despesa_cobranca_valor: 161.89, data_acordo: '2026-11-10', acordo_cobrancas: [], acordos_fontes_lello: { codigo_condominio: '63004', numero_acordo: '1409307' },
  parcelas_acordo: [{ id: 'p', numero: 1, vencimento: '2026-11-11', valor: 971.36, status: 'paga', data_pagamento: '2026-11-11' }] }
const acordoPortal = { unidade: '400038', numero: '1409307', situacao: 'Quitado', total: 97136, pago: 97136, cotas: [],
  parcelas: [{ numero: 1, vencimento: '2026-11-11', valor: 97136, pagamento: '2026-11-11', situacao: 'Contabilizado' }] }
const pagamento = { unidade: '400038', recibo: '3318217', descricao: 'Parcela 1 Acordo 1409307', vencimento: '2026-11-11', pagamento: '2026-11-11', valorPago: 97136 }

const periodo = { id: 'fechamento', inicio: '2026-10-13', fim: '2026-11-12', status: 'aberto' }

function executar({ parcelas = acordo.parcelas_acordo, recebimentos = [pagamento], ficha = {}, unidadeAtual = {}, despesa = 161.89, periodosBordero = [periodo] } = {}) {
  return planejarEspelhoLello({ consultadoEm: '2026-11-12T23:00:00Z', cotas: [{ unidade: '400038', recibo: '54111111', vencimento: '2026-10-10', valores: [38000, 0, 0, 0, 40000] }],
    acordos: [acordoPortal], pagamentos: recebimentos, contatos: [{ unidade: '400038', nome: 'Titular', email: 'confirmado@example.org', telefones: ['(11) 91234-5678'], ...ficha }] }, {
    condominio: { nome: 'Safira', vencimento_cota_dia: 10, dias_apos_vencimento_regua: 30 },
    unidades: [{ ...unidade, ...unidadeAtual }], cotas: [{ id: 'c', unidade_id: 'u', vencimento: '2026-10-10', observacoes: 'Recibo: 54111111',
      status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto', valor_original: 380, valor_atualizado: 400 }],
    acordos: [{ ...acordo, parcelas_acordo: parcelas, despesa_cobranca_valor: despesa }],
    periodosBordero,
    reguas: ['email', 'whatsapp'].map(canal => ({ ativo: true, etapas: [{ canal, ativo: true }] })),
  }, '63004')
}

test('espelho produz prévia com e-mail e WhatsApp e preserva repasse sem crédito', () => {
  const { contatosEFlows, bordero } = executar()
  assert.deepEqual(contatosEFlows.candidatas[0].canais, ['email', 'whatsapp'])
  assert.match(contatosEFlows.revisoes[0].motivo, /email, telefone/)
  assert.equal(bordero.inicio, '2026-10-13')
  assert.equal(bordero.fim, '2026-11-12')
  assert.equal(bordero.periodoId, 'fechamento')
  assert.equal(bordero.totalCentavos, 16189)
  assert.match(bordero.linhas[0].descricao, /acordo 1409307, unidade 400038, parcela 1\/1/)
})

test('titularidade conflitante ou indicação judicial bloqueia a prévia de flows', () => {
  assert.equal(executar({ ficha: { nome: 'Outro titular' } }).contatosEFlows.candidatas.length, 0)
  assert.equal(executar({ unidadeAtual: { numero_processo: 'CNJ' } }).contatosEFlows.candidatas.length, 0)
})

test('borderô retém falta de baixa, valor divergente e repasse sem origem', () => {
  for (const opcoes of [{ recebimentos: [] }, { recebimentos: [{ ...pagamento, valorPago: 97135 }] }, { despesa: 0 }]) {
    const { bordero } = executar(opcoes)
    assert.equal(bordero.totalCentavos, 0)
    assert.equal(bordero.pendencias.length, 1)
  }
})

test('baixa nova exige recibo do histórico e só é planejada uma vez', () => {
  const parcelas = [{ ...acordo.parcelas_acordo[0], status: 'pendente', data_pagamento: null }]
  const baixas = opcoes => executar(opcoes).alteracoes.filter(a => a.tipo === 'parcela_paga')
  assert.equal(baixas({ parcelas, recebimentos: [] }).length, 0)
  assert.equal(baixas({ parcelas, recebimentos: [pagamento, pagamento] }).length, 0)
  assert.equal(baixas({ parcelas })[0].recibo, pagamento.recibo)
  assert.equal(baixas({}).length, 0)
})

test('sem ciclo cadastrado o borderô fica pendente', () => {
  const resultado = executar({ periodosBordero: [] })
  assert.equal(resultado.bordero, null)
  assert.equal(resultado.pendencias.some(p => p.tipo === 'borderô'), true)
})

test('crédito divergente vira pendência e preserva o registro nas duas rotinas', () => {
  const app = { unidades: [unidade], acordos: [{ ...acordo, parcelas_acordo: [{ ...acordo.parcelas_acordo[0], recibo_financeiro: pagamento.recibo }] }] }
  const salvo = { parcela_id: 'p', recibo: pagamento.recibo, data_credito: '2026-11-12', valor_centavos: 2000 }
  const credito = { recibo: pagamento.recibo, referencia: 'credito-01', dataCredito: '2026-11-12', centavos: 3000 }
  const planoLello = { alteracoes: [], pendencias: [] }
  const repasses = confirmarRepassesLello(planoLello, { consultadoEm: '2026-11-12T15:00:00Z', pagamentos: [pagamento],
    repasses: [{ ...credito, unidade: unidade.identificacao }] }, app, [salvo], null)
  const planoManager = { alteracoes: [], pendencias: [], aguardandoExtrato: [] }
  const financeiro = completarFinanceiro(planoManager, new Map(), app, [salvo], { sha256: 'teste', repasses: [credito] }, 'Manager')
  for (const [plano, creditos] of [[planoLello, repasses], [planoManager, financeiro.repasses]]) {
    assert.equal(creditos[0].estado, 'divergente')
    assert.equal(creditos[0].valor, 2000)
    assert.equal(plano.pendencias.length, 1)
    assert.equal(plano.pendencias[0].valor, 3000)
    assert.equal(plano.alteracoes.length, 0)
  }
})

test('retomada reutiliza a etapa concluída e recolhe quando o índice muda', async () => {
  const salvas = new Map()
  const etapas = { salvas, salvar: async (etapa, dados) => salvas.set(etapa, dados) }
  const urls = [new URL('https://example.org/cotas?unidade=1')]
  let consultas = 0
  const coletar = async () => [++consultas]
  const executarEtapa = dependencia => coletarEtapaLello(etapas, 'cotas', urls, dependencia, () => {}, coletar)
  assert.deepEqual(await executarEtapa('1'), [1])
  assert.deepEqual(await executarEtapa('1'), [1])
  assert.deepEqual(await executarEtapa('2'), [2])
  await assert.rejects(coletarEtapaLello(etapas, 'historicos', urls, '1', () => {}, async () => { throw Error('interrompida') }))
  assert.equal(salvas.has('historicos'), false)
})
