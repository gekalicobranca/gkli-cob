import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clausulasBuscaCondominio } from '../features/condominios/busca'

test('nome do Verdana Torre 3 não amplia a busca para qualquer CNPJ com 3', () => {
  const clauses = clausulasBuscaCondominio('VERDANA SUITES JARDIM PRUDENCIA SETOR MORADIA TORRE 3')
  assert.equal(clauses.length, 3)
  assert.ok(clauses.every(clause => !clause.startsWith('cnpj.')))
  assert.ok(clauses[0].includes('TORRE 3'))
})

test('CNPJ completo, formatado e parcial continuam pesquisáveis', () => {
  for (const text of ['19.777.204/0001-61', '19777204000161', '19777']) {
    assert.ok(clausulasBuscaCondominio(text).includes(`cnpj.ilike.%${text.replace(/\D/g, '')}%`))
  }
})

test('nomes com vírgulas, parênteses e aspas permanecem dentro de um único padrão', () => {
  assert.equal(clausulasBuscaCondominio('Edifício (Torre 2), "Azul"')[0], 'nome.ilike."%Edifício (Torre 2), \\"Azul\\"%"')
  assert.deepEqual(clausulasBuscaCondominio(' %_* '), [])
})
