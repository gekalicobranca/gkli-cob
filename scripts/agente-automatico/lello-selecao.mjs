export async function aguardarCondominioSelecionado(page, codigo, timeout = 20_000) {
  // Conferir apenas o cabeçalho: resultados escondidos no dropdown não são seleção.
  const resultado = await page.waitForFunction((code) => {
    return [...document.querySelectorAll('button[data-toggle="dropdown"]')].some((el) => {
      const style = getComputedStyle(el)
      const visivel = style.display !== 'none' && style.visibility !== 'hidden' &&
        Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      const selecionado = (el.innerText || el.textContent || '').trim().match(/^(\d+)\s*-/)?.[1]
      return visivel && selecionado === code
    })
  }, String(codigo).trim(), { timeout }).catch((error) => {
    if (error.name === 'TimeoutError') return null
    throw error
  })
  if (!resultado) return false
  await resultado.dispose()
  return true
}
