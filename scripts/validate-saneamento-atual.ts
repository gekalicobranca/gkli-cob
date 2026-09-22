import assert from 'node:assert/strict'
import { test } from 'node:test'
import { motivosSaneamentoAtuais } from '../features/flows/cobranca/saneamento-atual'

const row = { id: 'c1', condominio_id: 'cond1', unidade: { identificacao: '01', bloco: 'A', responsavel_nome: 'Maria', email: 'maria@example.com' } }
const jobs = [{ regua_id: 'r1', pendencias: [{ cobranca_id: 'c1', motivo: 'Responsável não cadastrado', saneamento: true }] }]
const preferencias = new Map([['r1', 'inquilino']])

test('cadastro corrigido sai do saneamento apesar da pendência salva', () => {
  assert.equal(motivosSaneamentoAtuais([row], jobs, [], preferencias).size, 0)
  assert.equal(motivosSaneamentoAtuais([{ ...row, unidade: [row.unidade] }], jobs, [], preferencias).size, 0)
})

test('correção parcial mostra o motivo atual e responsável vazio continua pendente', () => {
  const semEmail = { ...row, unidade: { ...row.unidade, email: '' } }
  assert.equal(motivosSaneamentoAtuais([semEmail], jobs, [], preferencias).get('c1'), 'E-mail ausente ou inválido')
  const semNome = { ...row, unidade: { ...row.unidade, responsavel_nome: ' ' } }
  assert.equal(motivosSaneamentoAtuais([semNome], jobs, [], preferencias).get('c1'), 'Responsável não cadastrado')
})

test('contatos de apoio respeitam condomínio, bloco e preferência da régua', () => {
  const apoio = { condominio_id: 'cond1', unidade: '01', bloco: ' a ', tipo_responsavel: 'inquilino', email: 'invalido' }
  assert.equal(motivosSaneamentoAtuais([row], jobs, [apoio], preferencias).get('c1'), 'E-mail ausente ou inválido')
  assert.equal(motivosSaneamentoAtuais([row], jobs, [{ ...apoio, email: 'apoio@example.com' }], preferencias).size, 0)
  assert.equal(motivosSaneamentoAtuais([row], jobs, [{ ...apoio, condominio_id: 'outro' }], preferencias).size, 0)
  assert.equal(motivosSaneamentoAtuais([row], jobs, [{ ...apoio, bloco: 'B' }], preferencias).size, 0)
})

test('ignora pendências fora dos filtros e que não são de saneamento', () => {
  assert.equal(motivosSaneamentoAtuais([], jobs, [], preferencias).size, 0)
  assert.equal(motivosSaneamentoAtuais([{ ...row, unidade: null }], [{ pendencias: [{ cobranca_id: 'c1', saneamento: false }] }], [], preferencias).size, 0)
})
