import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicarPrioridadeHumana } from '../features/keila/prioridade-humana'
import type { DecisaoObservacaoKeila } from '../features/keila/observacao'

const decisao: DecisaoObservacaoKeila = {
  negociacao_humana_outro_canal: true, classificacao: 'esclarecimento',
  evidencias: ['Retorno combinado com agente humano.'],
  proxima_acao_simulada: 'Perguntar unidade e oferecer 4x.',
  dados_faltantes: ['Unidade', 'Comprovante'], nao_deve_fazer: [],
  resposta_simulada: 'Pode confirmar a unidade? Podemos negociar em 4x.',
}
test('negociação humana bloqueia perguntas e novas condições mesmo se o modelo as sugerir', () => {
  const resultado = aplicarPrioridadeHumana(decisao, 'Pablo', new Date('2026-10-06T18:00:00Z'))
  assert.equal(resultado.classificacao, 'prioridade_humana')
  assert.deepEqual(resultado.dados_faltantes, [])
  assert.match(resultado.resposta_simulada!, /^Boa tarde, Pablo\n\n\nObrigada pelo retorno! Seguimos à disposição\./)
  assert.doesNotMatch(resultado.resposta_simulada!, /\?|4x|unidade|comprovante/i)
  assert.equal(decisao.dados_faltantes.length, 2)
})
test('rascunho humano sem negociação em outro canal preserva a decisão e não gera resposta', () => {
  const rascunho = { ...decisao, negociacao_humana_outro_canal: false, resposta_simulada: null }
  assert.equal(aplicarPrioridadeHumana(rascunho), rascunho)
})
