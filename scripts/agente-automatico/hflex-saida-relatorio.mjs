/** O HFlex pode entregar o Excel diretamente ou abrir o visualizador. */
export async function aguardarSaidaRelatorioHflex(page, acionar, timeoutMs = 120_000) {
  const download = page.waitForEvent('download', { timeout: timeoutMs })
    .then(download => ({ popup: null, download }))
  const popup = page.context().waitForEvent('page', { timeout: timeoutMs })
    .then(popup => ({ popup, download: null,
      downloadPromise: popup.waitForEvent('download', { timeout: timeoutMs }).catch(() => null),
    }))
  // Instalar os dois observadores antes do clique e tratar rejeições imediatamente.
  const saida = Promise.any([download, popup])
  const resultado = saida.then(value => ({ value }), error => ({ error }))
  await acionar()
  const observado = await resultado
  if (observado.error) throw new Error('O HFlex não iniciou o download nem abriu o visualizador do relatório em 120 segundos.')
  return observado.value
}
