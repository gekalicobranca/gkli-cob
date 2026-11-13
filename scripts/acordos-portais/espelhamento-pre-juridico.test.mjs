import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planejarEspelhoLello } from './espelhamento-conciliar.mjs'

const antiga = { recibo: '111111', unidade: '100001', vencimento: '2026-08-14', valores: [38000, 0, 0, 0, 40000] }
const recente = { recibo: '222222', unidade: '100001', vencimento: '2026-11-10', valores: [38000, 0, 0, 0, 39000] }

function planejar({ itens = [antiga, recente], itensCadastrados = itens, segunda = {}, unidade = {}, acordos = [], acordosPortal = [], condominio = {} } = {}) {
  const cotas = itensCadastrados.map((item, i) => ({
    id: String(i), unidade_id: 'u', vencimento: item.vencimento, valor_original: 380,
    valor_atualizado: item.valores.at(-1) / 100, status_financeiro: 'em_aberto',
    status_operacional: i === 0 ? 'em_cobranca_ativa' : 'regular', observacoes: `Recibo ${item.recibo}`,
    ...(i === 1 ? segunda : {}),
  }))
  return planejarEspelhoLello({ consultadoEm: '2026-11-13T01:00:00Z', cotas: itens, acordos: acordosPortal, pagamentos: [] }, {
    condominio: { inicio_cobranca_dias: 30, dias_cobranca_ativa: 60, pre_juridico_habilitado: true, pre_juridico_minimo_cotas: 2,
      carteiras: { pre_juridico_habilitado: true }, ...condominio },
    unidades: [{ id: 'u', identificacao: '100001', ...unidade }], cotas, acordos,
  }, '63004')
}

test('o padrão de cinco exige cinco cotas distintas e mantém o prazo do saldo', () => {
  const itens = [antiga, ...[0, 1, 2, 3].map(i => ({
    ...recente, recibo: String(222222 + i), vencimento: `2026-11-0${i + 5}`,
  }))]
  const condominio = { pre_juridico_minimo_cotas: undefined }
  assert.equal(planejar({ itens: itens.slice(0, 4), condominio }).preJuridico.unidades.length, 0)
  const { preJuridico } = planejar({ itens, condominio })
  assert.equal(preJuridico.minimoCotas, 5)
  assert.equal(preJuridico.unidades[0].totalEmAtraso, 5)
  assert.equal(preJuridico.quantidadeCotas, 1)
  assert.equal(planejar({ itens, condominio, segunda: { data_pagamento: '2026-11-12' } }).preJuridico.unidades.length, 0)
})

test('conta uma segunda cota vencida abaixo do prazo sem somá-la ao encaminhamento', () => {
  const { preJuridico, alteracoes } = planejar()
  assert.equal(preJuridico.dataBase, '2026-11-12')
  assert.equal(preJuridico.prazoDias, 90)
  assert.equal(preJuridico.quantidadeCotas, 1)
  assert.equal(preJuridico.saldoCentavos, 40000)
  assert.equal(preJuridico.unidades[0].totalEmAtraso, 2)
  assert.equal(preJuridico.unidades[0].exigeRevisaoVinculo, false)
  assert.ok(alteracoes.every(a => a.tipo !== 'pre_juridico'))
})

test('chave da importação Lello identifica recibo único sem criar outra cota', () => {
  const segunda = { observacoes: 'Conversão de relatório - recibo LELLO-63004-100001-20261110\nHistórico original' }
  const { alteracoes, preJuridico } = planejar({ segunda })
  const ajuste = alteracoes.find(a => a.recibo === recente.recibo)
  assert.equal(ajuste.id, '1')
  assert.equal(ajuste.chaveLegada, 'LELLO-63004-100001-20261110')
  assert.equal(preJuridico.unidades[0].exigeRevisaoVinculo, false)
  assert.deepEqual(preJuridico.unidades[0].recibosParaVincular, ['1'])
  const detalhada = planejar({ segunda: {
    observacoes: 'Origem: Conversão de Relatório | Sistema: Lello Condomínios | Recibo: LELLO-63004-100001-20261110 | Composição origem: Taxa condominial',
  } })
  assert.equal(detalhada.alteracoes.find(a => a.recibo === recente.recibo)?.chaveLegada, ajuste.chaveLegada)
  assert.equal(detalhada.preJuridico.unidades[0].exigeRevisaoVinculo, false)
  const ambiguo = planejar({
    segunda, itens: [antiga, recente, { ...recente, recibo: '333333' }], itensCadastrados: [antiga, recente],
  })
  assert.equal(ambiguo.alteracoes.some(a => a.chaveLegada || !a.id), false)
  assert.equal(ambiguo.preJuridico.unidades.length, 0)
})

test('exclui cota única, cota a vencer, baixa no app, ação judicial e recibo vinculado', () => {
  const acordo = { id: 'a', unidade_id: 'u', status: 'ativo', cobranca_id: '1', acordo_cobrancas: [], parcelas_acordo: [] }
  for (const caso of [
    { itens: [antiga] },
    { itens: [antiga, { ...recente, vencimento: '2026-11-12' }] },
    { segunda: { data_pagamento: '2026-11-12' } },
    { unidade: { numero_processo: 'CNJ' } },
    { acordos: [acordo] },
    { acordos: [{ ...acordo, tipo: 'judicial', cobranca_id: null }] },
    { acordosPortal: [{ unidade: '100001', situacao: 'EM ANDAMENTO', cotas: [{ recibo: recente.recibo }], parcelas: [] }] },
  ]) assert.equal(planejar(caso).preJuridico.unidades.length, 0)
})

test('exibe simulação com pré desabilitado e sinaliza segunda cota com identidade provisória', () => {
  const { preJuridico } = planejar({ condominio: { pre_juridico_habilitado: false }, segunda: { observacoes: null } })
  assert.equal(preJuridico.habilitado, false)
  assert.equal(preJuridico.unidades.length, 1)
  assert.equal(preJuridico.unidades[0].exigeRevisaoVinculo, true)
})

test('dois recibos que apontam para a mesma cota do app não completam o mínimo', () => {
  const { preJuridico } = planejar({
    itens: [antiga, recente, { ...recente, recibo: '333333' }],
    itensCadastrados: [antiga, recente],
    segunda: { observacoes: null },
  })
  assert.equal(preJuridico.unidades.length, 0)
})
