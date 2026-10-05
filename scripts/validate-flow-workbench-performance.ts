import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avaliarGruposFlow, selecionarCondominiosIniciais, selecionarReguaGrupo } from '../features/flows/cobranca/selecao-workbench'
import { reguasDisponiveis } from '../features/flows/cobranca/canais'

test('seleção inicial mantém condomínio único e IDs explícitos com custo linear', () => {
  let reads = 0
  const rows = Array.from({ length: 100_000 }, (_, i) => ({
    id: String(i), get condominio_id() { reads++; return `c${i % 10}` },
  }))
  assert.deepEqual(selecionarCondominiosIniciais(rows, ['11', '22', '21']), ['c1', 'c2'])
  assert.ok(reads <= rows.length + 3, 'não percorre todos os condomínios para cada cobrança')
  assert.deepEqual(selecionarCondominiosIniciais([], []), [])
  assert.deepEqual(selecionarCondominiosIniciais([{ id: 'a', condominio_id: 'c' }, { id: 'b', condominio_id: 'c' }], []), ['c'])
  assert.deepEqual(selecionarCondominiosIniciais(rows, []), [])
})

test('opções e seleção de régua preservam canais mistos, escopo e preferências', () => {
  const reguas = [
    { id: 'global', carteira_id: null, etapas: [{ canal: 'email' }] },
    { id: 'local', carteira_id: 'a', etapas: [{ canal: 'email' }] },
    { id: 'preferida', carteira_id: 'a', etapas: [{ canal: 'whatsapp' }] },
    { id: 'mista', carteira_id: 'a', etapas: [{ canal: 'email' }, { canal: 'whatsapp' }] },
    { id: 'alheia', carteira_id: 'b', etapas: [{ canal: 'email' }] },
    { id: 'inativa', carteira_id: 'a', etapas: [{ canal: 'email', ativo: false }] },
  ]
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i), carteira_id: 'a', condominio_id: 'c', valor_original: 10,
    canais_ocupados: i % 2 ? ['email'] : ['whatsapp'],
    condominio: { nome: 'Condomínio', regua_cobranca_id: 'preferida' },
  }))
  const [grupo] = avaliarGruposFlow(rows, reguas)
  assert.equal(grupo.total, 10_000)
  assert.deepEqual(grupo.opcoesRegua.map(r => r.id), ['global', 'local', 'preferida'])
  assert.equal(selecionarReguaGrupo(grupo), 'preferida')
  assert.equal(selecionarReguaGrupo(grupo, 'global'), 'global')
  assert.equal(selecionarReguaGrupo(grupo, 'inexistente'), 'preferida')
  for (const row of rows) {
    assert.deepEqual([...grupo.reguasPorCobranca.get(row.id)!], reguasDisponiveis(row, reguas).map(r => r.id))
  }
  const chosen = selecionarReguaGrupo(grupo)
  assert.equal(grupo.rows.filter(row => grupo.reguasPorCobranca.get(row.id)?.has(chosen)).length, 500)
  assert.equal(avaliarGruposFlow([{ ...rows[0], canais_ocupados: ['*'] }], reguas)[0].opcoesRegua.length, 0)
})

test('preferência da carteira antecede global e a ordenação dos condomínios é preservada', () => {
  const reguas = [
    { id: 'global', carteira_id: null, etapas: [{ canal: 'email' }] },
    { id: 'local', carteira_id: 'a', etapas: [{ canal: 'email' }] },
  ]
  const rows = ['Zeta', 'Alfa'].map((nome, i) => ({
    id: String(i), carteira_id: 'a', condominio_id: nome,
    condominio: [{ nome, regua_cobranca_id: 'global' }], carteira: [{ nome: 'Carteira' }],
  }))
  const grupos = avaliarGruposFlow(rows, reguas)
  assert.deepEqual(grupos.map(g => g.condominioNome), ['Alfa', 'Zeta'])
  assert.equal(selecionarReguaGrupo(grupos[0]), 'local')
  assert.equal(selecionarReguaGrupo(grupos[0], 'global'), 'global')
  assert.equal(grupos[0].carteiraNome, 'Carteira')
})
