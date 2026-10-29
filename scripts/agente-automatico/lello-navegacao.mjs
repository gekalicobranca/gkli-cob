export async function abrirPortalLello(page, url, registrar = async () => {}) {
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      return
    } catch (error) {
      if (!/Timeout|net::ERR_(TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)/i.test(String(error?.message))) throw error
      // Alguns recursos atrasam o DOMContentLoaded mesmo com o login pronto.
      const pronto = await page.locator('input[type="password"]:visible, button[data-toggle="dropdown"]:visible')
        .count().catch(() => 0)
      const origemEsperada = new URL(url).origin
      if (new URL(page.url()).origin === origemEsperada && pronto) return
      if (tentativa === 3) throw new Error('O portal Lello não carregou após 3 tentativas de até 60 segundos. Tente novamente quando o portal responder.', { cause: error })
      await registrar(`Portal Lello demorou a responder; nova tentativa de abertura (${tentativa + 1}/3).`)
      await page.waitForTimeout(2_000 * tentativa)
    }
  }
}
