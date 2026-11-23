import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carregarReguasEmailPendentesUnidade, chaveUnidadeEmail } from '../features/flows/cobranca/email-pendente-unidade'
import { reguasDisponiveis } from '../features/flows/cobranca/canais'
import { avaliarGruposFlow } from '../features/flows/cobranca/selecao-workbench'
import { planejarFlowsSequenciais } from '../features/flows/cobranca/criacao-sequencial'

const reguas = [
  { id: 'email', carteira_id: 'a', etapas: [{ canal: 'email' }] },
  { id: 'outra', carteira_id: 'a', etapas: [{ canal: 'email' }] },
  { id: 'mista', carteira_id: 'a', etapas: [{ canal: 'email' }, { canal: 'whatsapp' }] },
  { id: 'whatsapp', carteira_id: 'a', etapas: [{ canal: 'whatsapp' }] },
  { id: 'global', carteira_id: null, etapas: [{ canal: 'email' }] },
]

function banco(registros: any[], falhar = false) {
  let consultas = 0
  return { get consultas() { return consultas }, from(table: string) {
    assert.equal(table, 'mensagens')
    const filtros: ((row: any) => boolean)[] = []
    const valor = (row: any, key: string) => key.split('.').reduce((v, k) => v?.[k], row)
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: unknown) => { filtros.push(row => valor(row,key) === value); return q },
      neq: (key: string, value: unknown) => { filtros.push(row => valor(row,key) !== value); return q },
      in: (key: string, values: string[]) => { filtros.push(row => values.includes(valor(row,key))); return q },
      range: async (inicio: number, fim: number) => {
        consultas++
        return { data: registros.filter(row => filtros.every(f => f(row))).slice(inicio,fim+1), error: falhar ? { message: 'falhou' } : null }
      },
    }
    return q
  } }
}

const mensagem = (status: string, reguaId = 'email', unidadeId = 'u1', carteiraId = 'a') => ({
  id: `${status}-${reguaId}-${unidadeId}`, carteira_id: carteiraId, canal: 'email', status,
  cobranca: { unidade_id: unidadeId }, flow: { regua_id: reguaId, status: 'pronto' },
})

test('pendências de outra cota bloqueiam unidade+régua nos três estados abertos', async () => {
  for (const status of ['pendente_aprovacao','aprovada','agendada']) {
    const db = banco([mensagem(status)])
    const pendentes = await carregarReguasEmailPendentesUnidade(db, [{ carteira_id:'a', unidade_id:'u1' }], reguas)
    const row = { carteira_id: 'a', reguas_email_pendentes: [...pendentes.get(chaveUnidadeEmail('a','u1'))!] }
    assert.deepEqual(reguasDisponiveis(row, reguas).map(r=>r.id), ['outra','mista','whatsapp','global'])
    assert.equal(db.consultas, 1)
  }
})

test('mensagens encerradas, Flow cancelado, outra carteira ou unidade não bloqueiam', async () => {
  const db = banco([
    ...['enviada','falha','cancelada'].map(status=>mensagem(status)),
    { ...mensagem('agendada'), flow:{ regua_id:'email', status:'cancelado' } },
    mensagem('agendada','email','u1','b'), mensagem('agendada','email','u2'),
  ])
  assert.equal((await carregarReguasEmailPendentesUnidade(db,[{carteira_id:'a',unidade_id:'u1'}],reguas)).size,0)
})

test('régua mista pendente é excluída; WhatsApp puro e outras réguas permanecem', async () => {
  const pendentes = await carregarReguasEmailPendentesUnidade(banco([mensagem('aprovada','mista')]),[{carteira_id:'a',unidade_id:'u1'}],reguas)
  const row = { carteira_id:'a', reguas_email_pendentes:[...pendentes.get(chaveUnidadeEmail('a','u1'))!] }
  assert.deepEqual(reguasDisponiveis(row,reguas).map(r=>r.id),['email','outra','whatsapp','global'])
  const db = banco([])
  await carregarReguasEmailPendentesUnidade(db,[{carteira_id:'a',unidade_id:'u1'}],[reguas[3]])
  assert.equal(db.consultas,0)
})

test('seleção por condomínio não recoloca a régua bloqueada nem suas cotas no plano', () => {
  const rows = [
    {id:'nova-cota',carteira_id:'a',unidade_id:'u1',condominio_id:'c',reguas_email_pendentes:['email']},
    {id:'outra-cota',carteira_id:'a',unidade_id:'u2',condominio_id:'c',reguas_email_pendentes:[]},
  ]
  const [grupo] = avaliarGruposFlow(rows,reguas)
  assert.equal(grupo.reguasPorCobranca.get('nova-cota')!.has('email'),false)
  const selecionadas = grupo.rows.filter(row=>grupo.reguasPorCobranca.get(row.id)?.has('email'))
  const plano = planejarFlowsSequenciais(selecionadas,{c:'email'},'email')
  assert.deepEqual(plano.flatMap(p=>p.cobrancas.map(r=>r.id)),['outra-cota'])
})

test('paginação consulta todas as pendências, incluindo réguas globais, e falhas não liberam', async () => {
  const dados = Array.from({length:501},(_,i)=>mensagem('agendada', i===500?'global':'email'))
  const db = banco(dados)
  const resultado = await carregarReguasEmailPendentesUnidade(db,[{carteira_id:'a',unidade_id:'u1'}],reguas)
  assert.deepEqual([...resultado.get(chaveUnidadeEmail('a','u1'))!],['email','global'])
  assert.equal(db.consultas,2)
  await assert.rejects(carregarReguasEmailPendentesUnidade(banco([],true),[{carteira_id:'a',unidade_id:'u1'}],reguas),/conferir os e-mails pendentes/)
})
