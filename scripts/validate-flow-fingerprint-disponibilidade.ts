import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fingerprintInicialFlow, carregarReguasComFingerprintExistente } from '../features/flows/cobranca/fingerprint-disponibilidade'
import { criarReguaFingerprint, cicloReferencia } from '../features/regua/services/regua-shared'
import { reguasDisponiveis } from '../features/flows/cobranca/canais'
import { avaliarGruposFlow } from '../features/flows/cobranca/selecao-workbench'
import { validarCriacaoPorCanal } from '../features/flows/cobranca/vinculos-canais'

const regua = { id:'r', carteira_id:'a', tipo:'cobranca', ativo:true, etapas:[
  {id:'etapa-tardia',regua_id:'r',canal:'email' as const,ativo:true,ordem:1,delay_dias:7},
  {id:'etapa-inativa',regua_id:'r',canal:'email' as const,ativo:false,ordem:0,delay_dias:0},
  {id:'etapa-primeira',regua_id:'r',canal:'email' as const,ativo:true,ordem:2,delay_dias:0},
] }
const row = {id:'cota',carteira_id:'a',condominio_id:'condominio',unidade_id:'unidade'}
const chave = fingerprintInicialFlow(row.id,regua,'2026-11')!

function banco(tabelas: Record<string,any[]>, falhar = '') {
  const chamadas: string[] = []
  return { chamadas, from(table: string) {
    const filtros: ((row: any)=>boolean)[] = []
    let single = false, inicio = 0, fim = 99999
    const valor = (r: any,k: string) => k.split('.').reduce((v,p)=>v?.[p],r)
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string,v: any)=>{filtros.push(r=>valor(r,k)===v);return q},
      neq: (k: string,v: any)=>{filtros.push(r=>valor(r,k)!==v);return q},
      in: (k: string,ids: string[])=>{filtros.push(r=>ids.includes(valor(r,k)));return q},
      is: (k: string,v: any)=>{filtros.push(r=>(valor(r,k)??null)===v);return q},
      not: (k: string)=>{filtros.push(r=>valor(r,k)!=null);return q},
      limit: (n: number)=>{fim=n-1;return q}, single: ()=>{single=true;return q},
      range: (a: number,b: number)=>{inicio=a;fim=b;return q},
      then: (resolve: any,reject: any)=>{
        chamadas.push(table)
        const resultado=(tabelas[table]??[]).filter(r=>filtros.every(f=>f(r))).slice(inicio,fim+1)
        return Promise.resolve({data:single?resultado[0]:resultado,error:table===falhar?{message:'falhou'}:null}).then(resolve,reject)
      },
    }
    return q
  } } as any
}

test('chave usa a primeira etapa efetiva, normalização e o mesmo ciclo do processador',()=>{
  assert.equal(chave,criarReguaFingerprint({contexto:'regua_cobranca',entidadeId:'cota',etapaId:'etapa-primeira',canal:'email',ciclo:'2026-11'}))
  assert.equal(fingerprintInicialFlow('cota',{...regua,etapas:[{id:'default-email',canal:'email',ordem:1,delay_dias:0}]},'2026-11'), 'regua_cobranca:cota:default-email:email:2026-11')
  assert.equal(fingerprintInicialFlow('cota',{...regua,etapas:[]},'2026-11'),null)
})

test('qualquer status de mensagem, inclusive cancelada/rascunho/enviada, ocupa a chave exata',async()=>{
  for(const status of ['cancelada','rascunho','enviada','falha','pendente_aprovacao','aprovada','agendada']) {
    const db=banco({mensagens:[{fingerprint:chave,status}]})
    assert.equal((await carregarReguasComFingerprintExistente(db,[row],[regua],'2026-11')).get(row.id)?.has(regua.id),true)
  }
})

test('histórico consolidado de lote com mensagem vinculada ocupa chave; item sem mensagem não',async()=>{
  for(const mensagem_id of ['mensagem-antiga',null]) {
    const db=banco({lote_itens:[{fingerprint:chave,mensagem_id,status:'cancelado'}]})
    assert.equal((await carregarReguasComFingerprintExistente(db,[row],[regua],'2026-11')).has(row.id),Boolean(mensagem_id))
  }
})

test('outra cobrança, etapa, canal, mês ou ciclo Maestro não ocupa chave corrente',async()=>{
  const dados=[chave.replace(':cota:',':outra:'),chave.replace(':etapa-primeira:',':etapa-tardia:'),
    chave.replace(':email:',':whatsapp:'),chave.replace('2026-11','2026-10'),chave.replace('2026-11','maestro-execucao')]
  assert.equal((await carregarReguasComFingerprintExistente(banco({mensagens:dados.map(fingerprint=>({fingerprint}))}),[row],[regua],'2026-11')).size,0)
})

test('regra bloqueada sai da seleção, preservando WhatsApp e régua com primeira etapa distinta',async()=>{
  const whatsapp={...regua,id:'w',etapas:[{id:'whatsapp',canal:'whatsapp' as const,ordem:1,delay_dias:0}]}
  const alternativa={...regua,id:'outra',etapas:[{id:'outra-etapa',canal:'email' as const,ordem:1,delay_dias:0}]}
  const reguas=[regua,whatsapp,alternativa]
  const historico=await carregarReguasComFingerprintExistente(banco({mensagens:[{fingerprint:chave}]}),[row],reguas,'2026-11')
  const filtrada={...row,reguas_fingerprint_existente:[...historico.get(row.id)!]}
  assert.deepEqual(reguasDisponiveis(filtrada,reguas).map(r=>r.id),['w','outra'])
  assert.equal(avaliarGruposFlow([filtrada],reguas)[0].reguasPorCobranca.get('cota')?.has('r'),false)
})

test('consulta pagina mais de 500 registros e erro não vira ausência de histórico',async()=>{
  const db=banco({lote_itens:Array.from({length:501},()=>({fingerprint:chave,mensagem_id:'mensagem'}))})
  assert.equal((await carregarReguasComFingerprintExistente(db,[row],[regua],'2026-11')).size,1)
  assert.equal(db.chamadas.filter((t:string)=>t==='lote_itens').length,2)
  await assert.rejects(carregarReguasComFingerprintExistente(banco({},'mensagens'),[row],[regua],'2026-11'),/histórico de mensagens/)
})

test('servidor recusa seleção antiga pela chave antes de gerar lote e mantém proteção original',async()=>{
  const fingerprint=fingerprintInicialFlow('cota',regua,cicloReferencia())
  const db=banco({reguas:[regua],mensagens:[{fingerprint,status:'cancelada',cobranca_flow_id:null}]})
  await assert.rejects(validarCriacaoPorCanal(db,[row],'r'),/etapa, canal e ciclo/)
})
