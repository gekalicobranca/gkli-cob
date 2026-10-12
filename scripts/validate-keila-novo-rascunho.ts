import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepararNovoRascunho } from '../features/keila/novo-rascunho'
import type { KeilaCasoPayload } from '../features/keila/casos'

const base: KeilaCasoPayload = { versao: 1, estado: 'aguardando_retorno', intencao: 'parcelamento', unidade_ids: ['u'], emails: [], atividades: [], proxima_acao: 'Acompanhar', envio_permitido: false, modo: 'supervisionado',
  resposta_aprovada: { mensagem_id: 'm1', em: '2026-10-12T02:00:00Z', usuario_id: 'operador', destinatario: 'a@example.com', assunto: 'Re: Pedido', texto: 'Resposta aprovada', email_chave: 'retorno-1' } }

test('rotina não altera resposta aprovada para o mesmo retorno, mesmo após envio', () => {
  assert.throws(() => prepararNovoRascunho(base, 'retorno-1', 'Alterado', 'enviada'), /já tem resposta aprovada/)
})
test('novo retorno não substitui resposta em fila, falha ou envio incerto', () => {
  for (const status of [undefined, 'agendada', 'falha', 'enviando', 'incerto']) assert.throws(() => prepararNovoRascunho(base, 'retorno-2', 'Novo', status), /pendente ou incerto/)
})
test('novo retorno após envio preserva evidência anterior e exige nova aprovação', () => {
  const p = prepararNovoRascunho(base, 'retorno-2', 'Novo rascunho', 'enviada')
  assert.equal(p.resposta_aprovada, undefined)
  assert.deepEqual(p.respostas_anteriores, [base.resposta_aprovada])
  assert.equal(p.resposta_email_chave, 'retorno-2')
  assert.equal(p.resposta_simulada, 'Novo rascunho')
  assert.equal(p.envio_permitido, false)
  assert.equal(base.resposta_aprovada?.texto, 'Resposta aprovada')
})
