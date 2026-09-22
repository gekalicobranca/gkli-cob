const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runJob, recover } = require('./extension/core');
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
