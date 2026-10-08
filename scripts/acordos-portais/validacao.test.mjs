import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, validarTexto, validarPdf, totalBbzZerado } from './validacao.mjs'

test('BBZ vazio exige todos os valores do fechamento zerados', () => {
  assert.equal(totalBbzZerado('Total Geral 0,00 0,00 0,00'), true)
  assert.equal(totalBbzZerado('Total Geral 1.200,00 0,00 0,00'), false)
  assert.equal(totalBbzZerado('Total Geral'), false)
  assert.equal(totalBbzZerado('0,00 0,00'), false)
})

const lello = { portal: 'lello', codigo: '182', condominio: 'BOSQUE MARAJOARA' }
const bbz = { portal: 'bbz', condominio: 'CLOCK VILA ROMANA' }

test('BBZ sem acordos exige mensagem do portal e confirmação explícita', () => {
  const texto = 'CLOCK VILA ROMANA Acompanhamento de Acordo: Aberto e Baixado Sem acordos confirmado pelo portal Não há acordos registrados.'
  assert.throws(() => validarTexto(texto, bbz))
  assert.doesNotThrow(() => validarTexto(texto, { ...bbz, sem_acordos_confirmado: true }))
  assert.throws(() => validarTexto(texto.replace('Não há acordos registrados.', ''), { ...bbz, sem_acordos_confirmado: true }))
})
const textoLello = 'Acordos Em Andamento 182 - BOSQUE MARAJOARA RESUMO Valor Em Aberto'
const textoBbz = 'CLOCK VILA ROMANA Acompanhamento de Acordo: Aberto e Baixado (=) Total Geral'
test('aceita o título e condomínio Lello demonstrados', () => assert.doesNotThrow(() => validarTexto(textoLello, lello)))
test('recusa PDF de outro condomínio mesmo com título correto', () => assert.throws(() => validarTexto(textoLello, { ...lello, condominio: 'OUTRO' }), /condomínio/))
test('recusa código Lello incorreto', () => assert.throws(() => validarTexto(textoLello, { ...lello, codigo: '18' }), /Código/))
test('recusa relatório de cotas em lugar de acordos', () => assert.throws(() => validarTexto(textoLello.replace('Acordos Em Andamento', 'Cotas Inadimplentes'), lello), /relatório/))
test('preserva o filtro BBZ incluindo baixados', () => assert.doesNotThrow(() => validarTexto(textoBbz, bbz)))
test('não confunde filtro Somente em Aberto com o demonstrado no BBZ', () => assert.throws(() => validarTexto(textoBbz.replace('Aberto e Baixado', 'Somente em Aberto'), bbz), /Filtro/))
test('recusa aviso de parâmetro inválido ou tabela sem fechamento', () => {
  assert.throws(() => validarTexto(`${textoBbz} Parâmetro Inválido`, bbz), /Parâmetro/)
  assert.throws(() => validarTexto(textoBbz.replace('Total Geral', ''), bbz), /total geral/)
})
test('recusa HTML de login recebido como PDF', async () => await assert.rejects(validarPdf(Buffer.from('<html>Login</html>'), lello), /PDF/))
test('normaliza acentos e espaços sem alterar dígitos', () => assert.equal(normalizar('  Condomínio\n182 '), 'CONDOMINIO 182'))
test('ausência de acordos exige confirmação explícita separada do texto', () => {
  const texto = 'Acordos Em Andamento 182 - BOSQUE MARAJOARA Sem acordos confirmado pelo portal Não Existe Acordos Em Andamento para este Condomínio'
  assert.throws(() => validarTexto(texto, lello), /incompleto/)
  assert.doesNotThrow(() => validarTexto(texto, { ...lello, sem_acordos_confirmado: true }))
})
