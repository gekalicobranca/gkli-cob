import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resumirValoresCobrancas } from '../features/cobrancas/subtotais'
import { STATUS_BLOQUEIOS, STATUS_OPERACIONAIS } from '../features/cobrancas/filtros-status'

test('card, carteiras e condomínios conciliam todas as páginas em centavos', () => {
  const rows = Array.from({ length: 2252 }, (_, i) => ({
    carteira_id: `carteira-${i % 3}`, condominio_id: `condominio-${i % 17}`,
    valor_atualizado: '10.01', status_operacional: 'em_cobranca_ativa',
  }))
  const resumo = resumirValoresCobrancas(rows)
  assert.equal(resumo.totalEmAberto, 22542.52)
  assert.equal(resumo.porCarteira.reduce((sum, c) => sum + c.quantidade, 0), 2252)
  assert.equal(resumo.porCarteira.reduce((sum, c) => sum + Math.round(c.valor * 100), 0), 2254252)
  for (const carteira of resumo.porCarteira) {
    assert.equal(carteira.condominios.reduce((sum, c) => sum + Math.round(c.valor * 100), 0), Math.round(carteira.valor * 100))
  }
})

test('mesma regra de valor para card e subtotais, inclusive fallback e bloqueios', () => {
  const resumo = resumirValoresCobrancas([
    { carteira_id: 'a', valor_original: '12.34', status: 'novo' },
    { carteira_id: 'a', valor_atualizado: 0, valor_original: 100, status: 'novo' },
    ...STATUS_BLOQUEIOS.map(status => ({ carteira_id: 'b', valor_atualizado: 100, status })),
  ])
  assert.equal(resumo.totalEmAberto, 12.34 + STATUS_BLOQUEIOS.length * 100)
  assert.equal(resumo.porCarteira.find(c => c.carteiraId === 'a')?.valor, 12.34)
  assert.equal(resumo.porCarteira.find(c => c.carteiraId === 'b')?.valor, STATUS_BLOQUEIOS.length * 100)
  assert.deepEqual(resumirValoresCobrancas([]), { totalEmAberto: 0, porCarteira: [] })
})

test('cada status filtrado conserva o valor da lista no card e nos subtotais', () => {
  for (const status of [...STATUS_OPERACIONAIS, ...STATUS_BLOQUEIOS]) {
    const resumo = resumirValoresCobrancas([
      { carteira_id: 'a', condominio_id: 'c', valor_atualizado: '123.45', status_operacional: status },
      { carteira_id: 'a', condominio_id: 'c', valor_original: '10.01', status },
    ])
    assert.equal(resumo.totalEmAberto, 133.46, status)
    assert.equal(resumo.porCarteira[0].valor, 133.46, status)
    assert.equal(resumo.porCarteira[0].condominios[0].valor, 133.46, status)
  }
})

test('duplicidades arquivadas não entram nos totais nem nas quantidades', () => {
  const resumo = resumirValoresCobrancas([
    { carteira_id: 'a', valor_atualizado: '50.25', status: 'suspenso' },
    { carteira_id: 'a', valor_atualizado: '50.25', status: 'suspenso', duplicada_de_id: 'original' },
  ])
  assert.equal(resumo.totalEmAberto, 50.25)
  assert.equal(resumo.porCarteira[0].quantidade, 1)
})
