/* Shared worker logic; no credential or message body is stored in the journal. */
(function (root) {
  function emailWindow(now) {
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));
    return hour>=22||hour<6;
  }
  function nextWake(now=new Date(), nextAt=null) {
    const requested=Date.parse(nextAt);
    const wake=new Date(Math.max(now.getTime()+1000,Math.min(requested>now.getTime()?requested:Infinity,now.getTime()+5*60000)));
    // Um horário diurno explícito vem do servidor; a autorização ainda é conferida no claim/start.
    if(emailWindow(wake)||(requested>now.getTime()&&!emailWindow(new Date(requested))))return wake.getTime();
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(wake).map(p=>[p.type,p.value]));
    return wake.getTime()+((22-Number(parts.hour))*3600-Number(parts.minute)*60-Number(parts.second))*1000-wake.getMilliseconds();
  }
  async function acknowledge(deps, record) {
    await deps.api({ action: 'complete', jobId: record.id, state: record.state, receipt: record.receipt, error: record.error });
    await deps.save(null);
  }
  async function recover(deps, record) {
    if (!record) return false;
    const result = record.phase === 'completed' ? record : {
      id: record.id, phase: 'completed', state: record.phase === 'attempting' ? 'incerto' : 'falha',
      error: 'Execução interrompida. Conferir antes de qualquer reenvio.'
    };
    await deps.save(result);
    await acknowledge(deps, result);
    return true;
  }
  async function runJob(deps, job) {
    let attempting = false, tab;
    await deps.save({ id: job.id, phase: 'claimed' });
    let result;
    try {
      tab = await deps.prepare(job);
      await deps.save({ id: job.id, phase: 'attempting' });
      const permission = await deps.api({ action: 'start', jobId: job.id });
      if (!permission.ok) throw new Error('Envio suspenso pelo app.');
      attempting = true;
      const sent = await deps.send(tab);
      result = { id: job.id, phase: 'completed', state: 'enviado', receipt: sent?.headerMessageId || '' };
    } catch (error) {
      result = { id: job.id, phase: 'completed', state: attempting ? 'incerto' : 'falha', error: String(error.message || error).slice(0, 500) };
      if (tab !== undefined) await deps.close(tab).catch(() => {});
    }
    // An acknowledgement failure must never return to the send operation.
    await deps.save(result);
    await acknowledge(deps, result);
    return result;
  }
  const api = { runJob, recover, emailWindow, nextWake };
  if (typeof module !== 'undefined') module.exports = api;
  root.GkliTb = api;
})(globalThis);
