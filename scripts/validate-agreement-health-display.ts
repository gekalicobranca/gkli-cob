import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgreementHealthBadge } from '../features/acordos/components/agreement-health-badge'

for (const health of [undefined, null, '', 'desconhecido']) {
  test(`avaliação ausente/inválida (${String(health)}) não indica acordo saudável`, () => {
    const html = renderToStaticMarkup(createElement(AgreementHealthBadge, { health }))
    assert.match(html, /Não avaliado/)
    assert.doesNotMatch(html, /Saudável|emerald/)
  })
}
for (const [health, label] of [['saudavel', 'Saudável'], ['atencao', 'Atenção'], ['critico', 'Crítico']]) {
  test(`preserva a avaliação confirmada: ${health}`, () => {
    assert.match(renderToStaticMarkup(createElement(AgreementHealthBadge, { health })), new RegExp(label))
  })
}
