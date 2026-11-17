import assert from 'node:assert/strict'
import { test } from 'node:test'
import { basePreviaManager, planejarPreviasManager } from './espelhamento-manager.mjs'
import { completarFinanceiro } from './espelhamento-portais.mjs'

const dataBase = '2026-11-13'
const unidade = { id: 'u', identificacao: '0021', bloco: 'C2', responsavel_nome: 'Titular', email: 'anterior@example.org', updated_at: 'rev' }
const cota = { id: 'c', unidade_id: 'u', valor_original: 100, valor_atualizado: 110, vencimento: '2026-09-01', observacoes: 'Recibo: 123456', status_financeiro: 'em_aberto', status_operacional: 'em_cobranca_ativa' }
const relatorio = { unidade: '21', bloco: 'C2', recibo: '123456', vencimento: '01/09/2026', principal: 100, total: 110, componentes: 1 }
const parcela = { id: 'p', numero: 1, vencimento: '2026-11-05', valor: 500, recibo_financeiro: '987654', status: 'paga', data_pagamento: '2026-11-05' }
const acordo = { id: 'a', unidade_id: 'u', tipo: 'extrajudicial', origem_controle: 'carteira', status: 'quitado', data_acordo: '2026-11-01', valor_acordado: 500, despesa_cobranca_valor: 50, acordo_cobrancas: [], parcelas_acordo: [parcela] }
const app = { condominio: { nome: 'Manager', pre_juridico_habilitado: true, pre_juridico_minimo_cotas: 2, carteiras: { pre_juridico_habilitado: true }, inicio_cobranca_dias: 30, dias_cobranca_ativa: 60 },
  unidades: [unidade], cotas: [cota], acordos: [acordo], reguas: ['email', 'whatsapp'].map(canal => ({ ativo: true, etapas: [{ canal }] })),
  periodosBordero: [{ id: 'f', inicio: '2026-11-01', fim: '2026-11-12', status: 'fechado' }] }
const cadastro = { unidade: 'u', consultadoEm: '2026-11-13T15:00:00Z', fichas: [{ Unidade: 'u', Nome: 'Titular', Email: 'novo@example.org', Celular: '11912345678' }] }
const extrato = { portal: 'manager', pagamentos: [{ recibo: '987654', vencimento: parcela.vencimento, natureza: 'parcela_acordo', numero_parcela: 1, componentes_conferidos: true, valor_original_centavos: 50000, valor_pago: 500, data_pagamento: '05/11/2026' }] }
const demonstrativo = [{ unidade: '21', bloco: 'C2', processo: 'P-1', total: { valor_centavos: 50000 }, parcelas: [{ parcela: '1/1', vencimento: '05/11/2026', valor_centavos: 50000 }] }]

function previa({ local = app, cotas = [relatorio], ficha = cadastro, pagamentos = extrato } = {}) {
  const extratos = new Map(pagamentos ? [['u', pagamentos]] : [])
  const financeiro = completarFinanceiro({ aguardandoExtrato: [], alteracoes: [], pendencias: [] }, extratos, local, dataBase)
  return planejarPreviasManager({ app: local, base: basePreviaManager(cotas, local, dataBase, extratos),
    cadastros: new Map(ficha ? [['u', ficha]] : []), confirmados: financeiro.confirmados, acordosPortal: demonstrativo, dataBase })
}

test('Manager coteja ficha por unidade e bloco e compõe o borderô com recebimento comprovado', () => {
  const p = previa()
  assert.deepEqual(p.contatosEFlows.candidatas[0].canais, ['email', 'whatsapp'])
  assert.equal(p.contatosEFlows.revisoes[0].depois.email, 'novo@example.org')
  assert.equal(p.bordero.totalCentavos, 5000)
  assert.match(p.bordero.linhas[0].descricao, /acordo P-1.*bloco C2.*parcela 1\/1/)
  assert.equal(p.bordero.linhas[0].credito, undefined)
})

test('Manager bloqueia conflito de recibo, ficha vencida, saldo desatualizado e cota vinculada', () => {
  for (const proposta of [
    previa({ ficha: { ...cadastro, consultadoEm: '2026-11-12T15:00:00Z' } }),
    previa({ cotas: [relatorio, { ...relatorio, recibo: 'AE 123456' }] }),
    previa({ cotas: [{ ...relatorio, total: 115 }] }),
    previa({ local: { ...app, acordos: [{ ...acordo, status: 'em_dia', acordo_cobrancas: [{ cobranca_id: 'c' }] }] } }),
  ]) assert.equal(proposta.contatosEFlows.candidatas.length, 0)
  const semExtrato = previa({ pagamentos: null })
  assert.equal(semExtrato.bordero.linhas.length, 0)
  assert.equal(semExtrato.bordero.pendencias.length, 1)
})

test('Manager separa a triagem de pré-jurídico dos flows e exige duas cotas', () => {
  const primeira = { ...cota, vencimento: '2026-07-01' }
  const segunda = { ...cota, id: 'c2', vencimento: '2026-09-01', observacoes: 'Recibo: 123457' }
  const local = { ...app, cotas: [primeira, segunda] }
  const cotas = [{ ...relatorio, vencimento: '01/07/2026' }, { ...relatorio, recibo: '123457' }]
  assert.equal(previa({ local, cotas: cotas.slice(0, 1) }).preJuridico.unidades.length, 0)
  const p = previa({ local, cotas })
  assert.equal(p.preJuridico.unidades[0].totalEmAtraso, 2)
  assert.equal(p.preJuridico.quantidadeCotas, 1)
  assert.deepEqual(p.contatosEFlows.candidatas.map(r => r.recibo), ['123457'])
})
