const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runJob, recover } = require('./extension/core');
const { emailWindow, nextWake } = require('./extension/core');
test('agendamento Thunderbird respeita 22h–06h e não repete consultas por reserva vencida',()=>{
 assert.equal(emailWindow(new Date('2026-10-16T01:00Z')),true);
 assert.equal(emailWindow(new Date('2026-10-16T09:00Z')),false);
 assert.equal(new Date(nextWake(new Date('2026-10-15T15:00Z'))).toISOString(),'2026-10-16T01:00:00.000Z');
 assert.equal(new Date(nextWake(new Date('2026-10-16T08:59Z'))).toISOString(),'2026-10-17T01:00:00.000Z');
 assert.equal(new Date(nextWake(new Date('2026-10-16T01:00Z'),'2026-10-15T12:00Z')).toISOString(),'2026-10-16T01:05:00.000Z');
});
function mock() {
  const state = { sent: 0, journal: null, completed: [] };
  const deps = {
    save: async r => { state.journal = r; },
    prepare: async () => 1, close: async () => {},
    send: async () => { state.sent++; return { headerMessageId: 'test@example.com' }; },
    api: async body => { if (body.action === 'complete') state.completed.push(body); return { ok: true }; },
  };
  return { state, deps };
}

test('horário explícito do servidor pode antecipar a janela sem liberar a agenda padrão',()=>{
 const now=new Date('2026-10-26T19:00Z');
 assert.equal(new Date(nextWake(now,'2026-10-26T19:10Z')).toISOString(),'2026-10-26T19:05:00.000Z');
 assert.equal(new Date(nextWake(now,'2026-10-27T01:00Z')).toISOString(),'2026-10-27T01:00:00.000Z');
 assert.equal(new Date(nextWake(now)).toISOString(),'2026-10-27T01:00:00.000Z');
 assert.equal(new Date(nextWake(now,'inválido')).toISOString(),'2026-10-27T01:00:00.000Z');
 assert.equal(new Date(nextWake(new Date('2026-10-27T01:00Z'),'2026-10-27T02:00Z')).toISOString(),'2026-10-27T01:05:00.000Z');
});

test('worker agenda nova consulta depois de entregar uma mensagem durante o dia',async()=>{
 const vm=require('node:vm');const fs=require('node:fs');
 const sandbox={Date,URL,AbortSignal,console,fetch:async(_url,options)=>({ok:true,json:async()=>JSON.parse(options.body).action==='status'?{email:'operacao@example.com'}:{job:{id:'job'}}}),
  GkliTb:{recover:async()=>false,runJob:async()=>({state:'enviado'}),nextWake:(now,next)=>Date.parse(next)||now.getTime()+60000},
  browser:{storage:{local:{get:async()=>({pairing:{token:'local-test'},enabled:true}),set:async()=>{}}},
   accounts:{list:async()=>[{identities:[{id:'id',email:'operacao@example.com'}]}]},compose:{},tabs:{},
   runtime:{onMessage:{addListener:()=>{}}},browserAction:{onClicked:{addListener:()=>{}}},
   alarms:{clear:async()=>{},create:()=>{},onAlarm:{addListener:()=>{}}}}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('./extension/background.js'),'utf8'),sandbox);
 const before=Date.now();const result=await vm.runInContext('tick()',sandbox);
 assert.ok(Date.parse(result.nextAt)>=before+60000);
 assert.ok(Date.parse(result.nextAt)<=Date.now()+60000);
});
test('envio confirmado registra recibo uma única vez', async () => {
  const { state, deps } = mock(); await runJob(deps, { id: 'one' });
  assert.equal(state.sent, 1); assert.equal(state.completed[0].state, 'enviado'); assert.equal(state.journal, null);
});
test('falha de confirmação no app não reenvia ao recuperar', async () => {
  const { state, deps } = mock(); const api = deps.api;
  deps.api = async body => { if (body.action === 'complete') throw Error('offline'); return { ok: true }; };
  await assert.rejects(runJob(deps, { id: 'two' }));
  assert.equal(state.journal.state, 'enviado');
  deps.api = api; await recover(deps, state.journal);
  assert.equal(state.sent, 1); assert.equal(state.completed[0].state, 'enviado');
});
test('falha do Thunderbird é incerta e não é reenviada', async () => {
  const { state, deps } = mock(); deps.send = async () => { state.sent++; throw Error('connection lost'); };
  await runJob(deps, { id: 'three' }); assert.equal(state.completed[0].state, 'incerto'); assert.equal(state.sent, 1);
});
test('anexo indisponível impede envio', async () => {
  const { state, deps } = mock(); deps.prepare = async () => { throw Error('missing attachment'); };
  await runJob(deps, { id: 'four' }); assert.equal(state.sent, 0); assert.equal(state.completed[0].state, 'falha');
});
test('pausa entre reserva e envio impede transmissão', async () => {
  const { state, deps } = mock(); const api = deps.api;
  deps.api = async b => b.action === 'start' ? { ok: false } : api(b);
  await runJob(deps, { id: 'five' }); assert.equal(state.sent, 0);
});
test('interrupção durante envio exige conferência, sem transmissão', async () => {
  const { state, deps } = mock(); await recover(deps, { id: 'six', phase: 'attempting' });
  assert.equal(state.completed[0].state, 'incerto'); assert.equal(state.sent, 0);
});
