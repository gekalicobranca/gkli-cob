import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canaisDaRegua, conflitoDeCanais, reguasDisponiveis, filtrarFlowsPorCanal, filtrarReguasPorCanal } from '../features/flows/cobranca/canais'
import { carregarCanaisOcupados, temFlowEmAndamento, validarCriacaoPorCanal } from '../features/flows/cobranca/vinculos-canais'

const email = { id: 'email', carteira_id: 'a', etapas: [{ canal: 'email' }] }
const web = { id: 'web', carteira_id: 'a', etapas: [{ canal: 'whatsapp' }] }
test('filtro de e-mail exclui régua WhatsApp e cobranças disponíveis apenas para WhatsApp', () => {
  const reguas = [email, web]
  const row = { carteira_id: 'a', canais_ocupados: ['email'] }
  assert.deepEqual(filtrarReguasPorCanal(reguas, 'email'), [email])
  assert.deepEqual(reguasDisponiveis(row, filtrarReguasPorCanal(reguas, 'email')), [])
  assert.deepEqual(reguasDisponiveis(row, filtrarReguasPorCanal(reguas, 'whatsapp')), [web])
  assert.deepEqual(filtrarReguasPorCanal(reguas), reguas)
  assert.deepEqual(filtrarReguasPorCanal([{ etapas: [{ canal: 'email', ativo: false }, { canal: 'whatsapp' }] }], 'email'), [])
})
test('filtro de comunicação inclui Flows mistos nos dois canais e preserva todos sem filtro', () => {
  const flows = [{ id: 'e', canais: ['email'] }, { id: 'w', canais: ['whatsapp'] }, { id: 'm', canais: ['email', 'whatsapp'] }, { id: 'v', canais: [] }]
  assert.deepEqual(filtrarFlowsPorCanal(flows, 'email').map(f => f.id), ['e', 'm'])
  assert.deepEqual(filtrarFlowsPorCanal(flows, 'whatsapp').map(f => f.id), ['w', 'm'])
  assert.deepEqual(filtrarFlowsPorCanal(flows), flows)
})
test('um Flow por canal, incluindo réguas mistas, carteira e etapas inativas', () => {
  assert.deepEqual(reguasDisponiveis({ carteira_id: 'a', canais_ocupados: ['email'] }, [email, web]).map(r => r.id), ['web'])
  assert.deepEqual(reguasDisponiveis({ carteira_id: 'a', canais_ocupados: ['whatsapp'] }, [email, web]).map(r => r.id), ['email'])
  assert.deepEqual(reguasDisponiveis({ carteira_id: 'b' }, [email, web]), [])
  assert.equal(conflitoDeCanais(['email'], ['whatsapp', 'email']), true)
  assert.equal(conflitoDeCanais(['*'], ['whatsapp']), true)
  assert.deepEqual(canaisDaRegua({ etapas: [{ canal: 'email', ativo: false }, { canal: 'whatsapp' }] }), ['whatsapp'])
})

function mockDb(tables: Record<string, any[]>) {
  return { from(table: string) {
    const filters: ((row: any) => boolean)[] = []
    let single = false
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, val: any) => { filters.push(row => row[key] === val); return q },
      in: (key: string, vals: any[]) => { filters.push(row => vals.includes(row[key])); return q },
      is: (key: string, val: any) => { filters.push(row => (row[key] ?? null) === val); return q },
      not: (key: string) => { filters.push(row => row[key] != null); return q },
      range: () => q, single: () => { single = true; return q },
      then(resolve: any, reject: any) { const rows = (tables[table] ?? []).filter(row => filters.every(f => f(row))); return Promise.resolve({ data: single ? rows[0] : rows, error: null }).then(resolve, reject) },
    }
    return q
  } } as any
}

test('vínculos consolidados, tentativas vazias e mensagens órfãs mantêm o canal ocupado', async () => {
  const db = mockDb({ lote_itens: [
    { id: 'i1', cobranca_id: '1', cobranca_flow_id: 'f1', flow: { canais: ['email'], regua: web }, mensagem: { canal: 'email' } },
    { id: 'i2', cobranca_id: '2', cobranca_flow_id: 'f1', flow: { regua: email } },
    { id: 'i3', cobranca_id: '3', cobranca_flow_id: 'f2', flow: {} },
  ], mensagens: [{ id: 'm1', cobranca_id: '4', cobranca_flow_id: null, canal: 'whatsapp', status: 'pendente_aprovacao' }] })
  const result = await carregarCanaisOcupados(db, ['1', '2', '3', '4'])
  assert.deepEqual([...result.get('1')!], ['email'])
  assert.deepEqual([...result.get('2')!], ['email'])
  assert.deepEqual([...result.get('3')!], ['*'])
  assert.deepEqual([...result.get('4')!], ['whatsapp'])
})

test('retorno a Novo permite reativar histórico concluído sem liberar reenvio de mensagens enviadas', async () => {
  for (const status of ['concluido', 'concluido_com_falhas', 'cancelado']) assert.equal(temFlowEmAndamento({ flow: { status } }), false)
  for (const status of ['pronto', 'em_execucao', 'pausado', undefined]) assert.equal(temFlowEmAndamento({ flow: { status } }), true)
  const db = mockDb({ lote_itens: [
    { cobranca_id: 'cancelada', cobranca_flow_id: 'f', flow: { status: 'concluido', canais: ['email'] }, mensagem: { canal: 'email', status: 'cancelada', erro: 'Envio cancelado: cobrança fora da cobrança ativa. Reavalie a unidade antes de montar novo flow.' } },
    { cobranca_id: 'pulada', cobranca_flow_id: 'f', status: 'pulada', flow: { status: 'concluido', canais: ['email'] } },
    { cobranca_id: 'enviada', cobranca_flow_id: 'f', flow: { status: 'concluido', canais: ['email'] }, mensagem: { canal: 'email', status: 'enviada' } },
    { cobranca_id: 'pendente', cobranca_flow_id: 'f', status: 'pulada', flow: { status: 'em_execucao', canais: ['email'] } },
    { cobranca_id: 'outro_cancelamento', cobranca_flow_id: 'f', flow: { status: 'concluido', canais: ['email'] }, mensagem: { canal: 'email', status: 'cancelada', erro: 'Outro motivo exige revisão' } },
  ] })
  const result = await carregarCanaisOcupados(db, ['cancelada', 'pulada', 'enviada', 'pendente', 'outro_cancelamento'])
  assert.equal(result.has('cancelada'), false)
  assert.equal(result.has('pulada'), false)
  for (const id of ['enviada', 'pendente', 'outro_cancelamento']) assert.deepEqual([...result.get(id)!], ['email'])
})

test('servidor permite WhatsApp junto ao e-mail e bloqueia repetição, régua alheia e montagem concorrente do mesmo canal', async () => {
  const tables: Record<string, any[]> = {
    reguas: [{ ...web, tipo: 'cobranca', ativo: true }, { ...email, tipo: 'cobranca', ativo: true }],
    lote_itens: [{ cobranca_id: '1', cobranca_flow_id: 'f', flow: { regua: email } }],
    maestro_flow_montagens: [{ condominio_id: 'c', status: 'pendente', regua: null }],
  }
  const rows = [{ id: '1', carteira_id: 'a', condominio_id: 'c' }]
  assert.deepEqual(await validarCriacaoPorCanal(mockDb(tables), rows, 'web'), ['whatsapp'])
  await assert.rejects(validarCriacaoPorCanal(mockDb(tables), rows, 'email'), /Maestro/)
  tables.maestro_flow_montagens = []
  await assert.rejects(validarCriacaoPorCanal(mockDb(tables), rows, 'email'), /mesmo canal/)
  await assert.rejects(validarCriacaoPorCanal(mockDb(tables), [{ ...rows[0], carteira_id: 'b' }], 'web'), /desta carteira/)
  tables.mensagens = [{ cobranca_id: '1', canal: 'whatsapp', status: 'agendada' }]
  await assert.rejects(validarCriacaoPorCanal(mockDb(tables), rows, 'web'), /mesmo canal/)
})
