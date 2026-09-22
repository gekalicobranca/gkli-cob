import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resumirValoresCobrancas } from '../features/cobrancas/subtotais'

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
    ...['acordo_efetivado', 'suspenso', 'judicializado', 'pre_juridico'].map(status => ({ carteira_id: 'b', valor_atualizado: 100, status })),
  ])
  assert.equal(resumo.totalEmAberto, 12.34)
  assert.equal(resumo.porCarteira.find(c => c.carteiraId === 'a')?.valor, 12.34)
  assert.equal(resumo.porCarteira.find(c => c.carteiraId === 'b')?.valor, 0)
  assert.deepEqual(resumirValoresCobrancas([]), { totalEmAberto: 0, porCarteira: [] })
})
