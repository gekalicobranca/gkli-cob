// A navigation invalidates the old page context. Retry initialization in the
// new context, never a message transmission. Keep failures bounded and visible.
import { bounded } from './recovery.mjs'
export function resilientClient(BaseClient, report = console.error) {
  return class extends BaseClient {
    async requestPairingCode(...args) {
      report(new Date().toISOString(), 'Solicitando código de vinculação ao WhatsApp.')
      return super.requestPairingCode(...args)
    }
    async initWebVersionCache() {
      await super.initWebVersionCache()
      const userAgent = (await this.pupBrowser.userAgent()).replace('HeadlessChrome/', 'Chrome/')
      await this.pupPage.setUserAgent(userAgent)
      // whatsapp-web.js 1.34.7 navigates with waitUntil=load and timeout=0.
      // Bound that initial navigation; inject() separately waits for WA itself.
      const page = this.pupPage
      const originalGoto = page.goto
      page.goto = async function (url, options) {
        page.goto = originalGoto
        report(new Date().toISOString(), 'Abrindo WhatsApp; aguardando conteúdo inicial.')
        return originalGoto.call(page, url, { ...options, waitUntil: 'domcontentloaded', timeout: 120000 })
      }
    }
    async inject() {
      report(new Date().toISOString(), 'Conteúdo carregado; inicializando integração WhatsApp.')
      for (let attempt = 0; ; attempt++) {
        try {
          await this.pupPage.waitForFunction('window.Debug?.VERSION != undefined', { timeout: this.options.authTimeoutMs || 120000 })
          report(new Date().toISOString(), 'Contexto WhatsApp disponível; aguardando autenticação ou código.')
          return await bounded(super.inject(), 120000)
        } catch (error) {
          report(new Date().toISOString(), 'Falha ao inicializar WhatsApp:', String(error?.message || error))
          if (attempt >= 2 || !/execution context was destroyed|detached\s+frame/i.test(String(error?.message || error)) || this.pupPage.isClosed()) throw error
          report(new Date().toISOString(), 'Página navegou durante inicialização; retomando no novo contexto.', attempt + 1)
        }
      }
    }
  }
}
