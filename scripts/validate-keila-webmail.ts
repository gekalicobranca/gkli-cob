import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarFlowsWebmail, registrarRetornoWebmail, validarLinkWebmail, SAFIRA_PILOTO_ID } from '../features/keila/webmail'

test('aceita apenas links HTTPS do Outlook, sem credenciais nem domínios semelhantes', () => {
  assert.equal(validarLinkWebmail(''), undefined)
  assert.equal(validarLinkWebmail('https://outlook.office.com/mail/inbox/id/abc'), 'https://outlook.office.com/mail/inbox/id/abc')
  for (const url of ['javascript:alert(1)', 'http://outlook.office.com/mail', 'https://outlook.office.com.evil.test', 'https://user:pass@outlook.office.com', 'https://outlook.office.com:444/mail']) assert.throws(() => validarLinkWebmail(url))
})

function fixture() {
  const calls: string[] = []
  const tables: Record<string, Record<string, unknown>[]> = {
    condominios: [{ id: SAFIRA_PILOTO_ID, carteira_id: 'autorizada', operacao_virtual_habilitada: true, keila_retornos_desde: '2020-01-01' }],
    lote_itens: Array.from({ length: 501 }, (_, i) => ({ id: String(i), condominio_id: SAFIRA_PILOTO_ID })),
    mensagens: [{ id: 'safira', carteira_id: 'autorizada', canal: 'email', status: 'enviada', lote_item_id: '500', destinatario: 'a@example.com', flow: { nome: 'Régua Safira', status: 'concluido', iniciado_em: '2020-01-01' } },
      { id: 'outro-condominio', carteira_id: 'autorizada', canal: 'email', status: 'enviada', lote_item_id: 'estranho', flow: { nome: 'Outro', status: 'em_execucao', iniciado_em: '2020-01-01' } }],
  }
  const db = { from(table: string) {
    calls.push(table)
    let rows = [...(tables[table] ?? [])]
    const value = (row: Record<string, unknown>, key: string) => key.split('.').reduce<unknown>((v, part) => (v as Record<string, unknown>)?.[part], row)
    const q = {
      select() { return q },
      eq(key: string, v: unknown) { rows = rows.filter(r => value(r,key) === v); return q },
      in(key: string, values: unknown[]) { rows = rows.filter(r => values.includes(value(r,key))); return q },
      neq(key: string, v: unknown) { rows = rows.filter(r => value(r,key) !== v); return q },
      not(key: string) { rows = rows.filter(r => value(r,key) != null); return q },
      order() { return q }, range(a: number, b: number) { rows=rows.slice(a,b+1); return q },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
      then(resolve: (r: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
    }
    return q
  } } as unknown as SupabaseClient
  return { db, calls }
}

test('sem acesso à carteira não consulta destinatários', async () => {
  const { db, calls } = fixture()
  assert.equal((await carregarFlowsWebmail(db, [])).mensagens.length,0)
  assert.deepEqual(calls,['condominios'])
})

test('busca itens além da primeira página e exclui outro condomínio da mesma carteira', async () => {
  const { db } = fixture()
  const result = await carregarFlowsWebmail(db,['autorizada'])
  assert.deepEqual(result.mensagens.map(m => m.id),['safira'])
})

test('recusa associar resposta a mensagem de outro condomínio', async () => {
  const { db } = fixture()
  await assert.rejects(registrarRetornoWebmail(db,['autorizada'],{ mensagemId: 'outro-condominio', recebidoEm: new Date().toISOString(), conteudo: 'Retorno', link: '' }), /flow do Safira/)
})
