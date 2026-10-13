import { bounded } from './recovery.mjs'

// Closing the Puppeteer connection does not prove that Chrome exited. Do not
// release the worker while its browser can still hold the authentication lock.
export async function shutdownBrowser(client, forceKill, waitMs = 2000) {
  const browserProcess = client.pupBrowser?.process()
  try { await bounded(client.destroy(), 10000) } catch {}
  if (!browserProcess?.pid || browserProcess.exitCode !== null || browserProcess.signalCode) return
  let onExit
  try {
    await bounded(new Promise(resolve => {
      onExit = resolve
      browserProcess.once('exit', onExit)
      if (browserProcess.exitCode !== null || browserProcess.signalCode) resolve()
    }), waitMs)
  } catch {
    if (browserProcess.exitCode === null && !browserProcess.signalCode) await forceKill(browserProcess)
  } finally {
    browserProcess.removeListener('exit', onExit)
  }
}
