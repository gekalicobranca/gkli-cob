import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resultadosEasyPague } from './easy-pague-resultado.mjs'

const alvo = { parcela_id: 'p1', numero: 2, vencimento: '2026-11-03', valor: 60, recibo: '123456', acordo_externo: '343' }
const limite = '2026-11-08'
const extrato = {
  natureza: 'parcela_acordo', recibo: alvo.recibo, numero_parcela: 2, vencimento: '03/11/2026',
  data_pagamento: '08/11/2026', valor_original_centavos: 6000, valor_pago: 62, componentes_conferidos: true,
}

function verificarExtrato(pagamentos, alvos = [alvo]) {
  return resultadosEasyPague(alvos, { status: 'consultado', pagamentos }, 'manager', limite)
}

test('confirma o pagamento integral até ontem com encargos conferidos', () => {
  assert.deepEqual(verificarExtrato([extrato]), [{
    parcela_id: 'p1', estado: 'confirmado', data_pagamento: limite, valor_pago: 62, recibo: alvo.recibo,
  }])
})

test('mantém pendentes pagamentos de hoje, datas inválidas e pagamentos parciais', () => {
  for (const alteracao of [
    { data_pagamento: '09/11/2026' }, { data_pagamento: '31/10/2025', vencimento: '31/02/2026' },
    { data_pagamento: '31/02/2026' }, { valor_pago: 59 }, { componentes_conferidos: false },
    { numero_parcela: 3 }, { natureza: 'cobranca' }, { valor_original_centavos: 5900 },
  ]) {
    assert.equal(verificarExtrato([{ ...extrato, ...alteracao }])[0].estado, 'pendente')
  }
})

test('mantém pendentes vínculos e resultados ambíguos', () => {
  assert.equal(verificarExtrato([extrato, extrato])[0].estado, 'pendente')
  assert.ok(verificarExtrato([extrato], [alvo, { ...alvo, parcela_id: 'p2' }]).every(p => p.estado === 'pendente'))
})

test('confirma recibo contabilizado da Lello somente com vínculo explícito', () => {
  const doc = {
    tipo: 'recebimento', acordo_externo: alvo.acordo_externo, numero: 2, recibo_consultado: alvo.recibo,
    vencimento: alvo.vencimento, data_pagamento: limite, valor_original_centavos: 6000, valor_pago_centavos: 6000,
    confirmado_na_fonte: true, status: 'Contabilizado',
  }
  const verificar = doc => resultadosEasyPague([alvo], { recebimentos: [doc] }, 'lello', limite)[0].estado
  assert.equal(verificar(doc), 'confirmado')
  assert.equal(verificar({ ...doc, recibo_consultado: '' }), 'pendente')
  assert.equal(verificar({ ...doc, acordo_externo: '344' }), 'pendente')
  assert.equal(verificar({ ...doc, data_pagamento: '2026-11-09' }), 'pendente')
})
