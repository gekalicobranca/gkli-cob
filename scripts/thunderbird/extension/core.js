/* Shared worker logic; no credential or message body is stored in the journal. */
(function (root) {
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
  const api = { runJob, recover };
  if (typeof module !== 'undefined') module.exports = api;
  root.GkliTb = api;
})(globalThis);
