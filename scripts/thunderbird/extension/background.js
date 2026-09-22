const ENDPOINT = 'https://gkli-cob.vercel.app/api/integracoes/thunderbird';
let busy = false;
async function api(body) {
  const { pairing } = await browser.storage.local.get('pairing');
  if (!pairing?.token) throw new Error('Importe o arquivo de conexão primeiro.');
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairing.token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha de comunicação com o GKLI.');
  return data;
}
async function identity(email) {
  const accounts = await browser.accounts.list(false);
  const matches = accounts.flatMap(a => a.identities || []).filter(i => i.email.toLowerCase() === email.toLowerCase());
  if (matches.length !== 1) throw new Error('É necessária exatamente uma identidade Thunderbird com o e-mail da carteira.');
  return matches[0].id;
}
async function prepare(job) {
  const identityId = await identity(job.from);
  const attachments = [];
  let total = 0;
  for (const a of job.attachments || []) {
    const url = new URL(a.url);
    if (url.origin !== 'https://vjcmotflmcczoepflhwc.supabase.co' || !url.pathname.startsWith('/storage/v1/object/sign/')) throw new Error('Origem de anexo inválida.');
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Falha ao baixar anexo.');
    const data = await response.arrayBuffer(); total += data.byteLength;
    if (total > 20 * 1024 * 1024) throw new Error('Anexos excedem 20 MB.');
    attachments.push({ file: new File([data], a.name, { type: a.type || 'application/octet-stream' }) });
  }
  const tab = await browser.compose.beginNew({ identityId, to: [job.to], bcc: job.bcc ? [job.bcc] : [], subject: job.subject, isPlainText: true, plainTextBody: job.text, attachments });
  const details = await browser.compose.getComposeDetails(tab.id);
  if (details.identityId !== identityId) { await browser.tabs.remove(tab.id); throw new Error('Identidade de envio alterada.'); }
  return tab.id;
}
const deps = {
  api, prepare, save: record => browser.storage.local.set({ journal: record }),
  send: tab => browser.compose.sendMessage(tab, { mode: 'sendNow' }),
  close: tab => browser.tabs.remove(tab),
};
async function tick(testOnly = false) {
  if (busy) return { message: 'Já existe uma operação em andamento.' };
  busy = true;
  try {
    const { pairing, journal, enabled } = await browser.storage.local.get(['pairing', 'journal', 'enabled']);
    if (!pairing) return { message: 'Importe o arquivo de conexão.' };
    if (await GkliTb.recover(deps, journal)) return { message: 'Resultado anterior sincronizado; nenhum reenvio.' };
    if (!enabled && !testOnly) return { message: 'Fila automática pausada.' };
    const status = await api({ action: 'status' });
    await identity(status.email); // Never claim a job without its configured local identity.
    const { job } = await api({ action: 'claim', testOnly });
    if (!job) return { message: 'Nenhum envio elegível agora.', status };
    const result = await GkliTb.runJob(deps, job);
    const message = result.state === 'enviado' ? 'Envio confirmado pelo Thunderbird.' : 'Envio bloqueado: ' + result.error;
    await browser.storage.local.set({ lastResult: message });
    return { message };
  } finally { busy = false; }
}
browser.alarms.create('gkli-poll', { periodInMinutes: 1 });
browser.alarms.onAlarm.addListener(() => tick().catch(error => browser.storage.local.set({ lastResult: error.message })));
browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());
browser.runtime.onMessage.addListener(async message => {
  try {
    if (message.action === 'pair') {
      if (busy) throw new Error('Aguarde a operação atual.');
      const { journal } = await browser.storage.local.get('journal');
      if (journal) throw new Error('Sincronize o resultado pendente antes de trocar a conexão.');
      if (message.pairing?.endpoint !== ENDPOINT || !/^[\w-]{43}$/.test(message.pairing.token)) throw new Error('Arquivo de conexão inválido.');
      await browser.storage.local.set({ pairing: message.pairing, enabled: false });
      const status = await api({ action: 'status' }); await identity(status.email);
      return { message: 'Conectado à conta ' + status.email, status };
    }
    if (message.action === 'test') return await tick(true);
    if (message.action === 'mode') {
      if (busy) throw new Error('Aguarde a operação atual.');
      const status = await api({ action: 'status' }); await identity(status.email);
      await api({ action: 'mode', enabled: message.enabled === true });
      await browser.storage.local.set({ enabled: message.enabled === true });
      return { message: message.enabled ? 'Fila automática ativada.' : 'Fila automática pausada.' };
    }
    if (message.action === 'status') {
      const local = await browser.storage.local.get(['pairing', 'enabled', 'lastResult', 'journal']);
      return { message: local.lastResult || '', enabled: local.enabled, pending: Boolean(local.journal), status: local.pairing ? await api({ action: 'status' }) : null };
    }
  } catch (error) { return { error: error.message }; }
});
