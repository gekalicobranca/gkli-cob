import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparInbox } from '../features/inbox/agrupamento'
import type { CockpitItem } from '../features/cockpit/rules'

const item = (id: string, fields: Partial<CockpitItem> = {}): CockpitItem => ({
  id, tipo: 'cobranca', origem: 'Cobrança', titulo: 'Ana', subtitulo: 'Condomínio', status: 'novo',
  valor: 100, href: '/app/cobrancas/' + id, score: 50, prioridade: 'media', acao: 'Iniciar contato', motivo: '',
  condominioId: 'cond1', unidadeId: 'u1', unidadeLabel: '101 / A', responsavelNome: 'Ana', ...fields,
})

test('agrupa cotas antes da paginação, deduplica IDs e separa valores de acordos', () => {
  const a = item('c1', { responsavelDocumento: '529.982.247-25' })
  const b = item('c2', { responsavelDocumento: '52998224725', unidadeId: 'u2', unidadeLabel: '102 / A', valor: 200, score: 90, prioridade: 'critica' })
  const acordo = item('a1', { tipo: 'acordo', responsavelDocumento: '52998224725', valor: 900 })
  const [g] = agruparInbox([a, b, a, acordo])
  assert.equal(g.items.length, 3)
  assert.equal(g.valorCobrancas, 300)
  assert.equal(g.valorAcordos, 900)
  assert.equal(g.primeiro.id, 'c2')
  assert.equal(g.unidades.length, 2)
})

test('não une homônimos, documentos inválidos ou condomínios diferentes', () => {
  assert.equal(agruparInbox([item('a'), item('b', { unidadeId: 'u2' })]).length, 2)
  assert.equal(agruparInbox([item('a', { responsavelDocumento: '11111111111' }), item('b', { unidadeId: 'u2', responsavelDocumento: '11111111111' })]).length, 2)
  assert.equal(agruparInbox([item('a', { responsavelDocumento: '52998224725' }), item('b', { condominioId: 'cond2', responsavelDocumento: '52998224725' })]).length, 2)
})

test('último contato usa a interação mais recente, nunca a data do acordo', () => {
  const [g] = agruparInbox([item('a', { ultimaInteracaoAt: '2026-10-01' }), item('b', { ultimaInteracaoAt: '2026-10-15' }), item('c', { tipo: 'acordo', ultimaInteracaoAt: '2026-10-27' })])
  assert.equal(g.ultimaInteracao, '2026-10-15')
})
