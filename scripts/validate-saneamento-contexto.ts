import assert from 'node:assert/strict'
import test from 'node:test'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {CobrancaMensageriaCard} from '../features/cobrancas/components/cobranca-mensageria-card'
import {AgreementHealthBadge} from '../features/acordos/components/agreement-health-badge'
test('histórico apresenta todas as mensagens fornecidas para a cobrança', () => {
 const html=renderToStaticMarkup(createElement(CobrancaMensageriaCard,{mensagens:[{id:'a',conteudo:'Primeira mensagem',status:'enviada'},{id:'b',conteudo:'Segunda mensagem',status:'pendente'}]}))
 assert.match(html,/Histórico de mensagens \(2\)/);assert.match(html,/Primeira mensagem/);assert.match(html,/Segunda mensagem/)
 assert.doesNotMatch(html,/href="\/app\/mensageria"/)
})
test('histórico vazio mantém explicação contextual', () => {
 assert.match(renderToStaticMarkup(createElement(CobrancaMensageriaCard,{mensagens:[]})),/Nenhuma mensagem vinculada a esta cobrança/)
})
test('nenhuma parcela aberta não é apresentada como quitação comprovada', () => {
 const html=renderToStaticMarkup(createElement(AgreementHealthBadge,{health:'sem_abertas'}))
 assert.match(html,/Sem parcelas abertas/);assert.doesNotMatch(html,/Quitado|Em dia/)
})
