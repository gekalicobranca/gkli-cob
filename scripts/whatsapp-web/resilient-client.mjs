// A navigation invalidates the old page context. Retry initialization in the
// new context, never a message transmission. Keep failures bounded and visible.
import { bounded } from './recovery.mjs'
import { requestCodeInPage } from './pairing-code.mjs'
export const synchronizationTimeoutMs = 600000
export function resilientClient(BaseClient, report = console.error) {
  return class extends BaseClient {
    async requestPairingCode(phoneNumber, showNotification = true, intervalMs = 180000) {
      report(new Date().toISOString(), 'Solicitando código de vinculação ao WhatsApp.')
      try {
        for (const [name, callback] of [
          ['onCodeReceivedEvent', code => { this.emit('code', code); return code }],
          ['onPairingFailureEvent', reason => {
            report(new Date().toISOString(), reason === 'rate_limit' ? 'WhatsApp limitou a geração de códigos (429). Renovação automática interrompida; use QR Code.' : 'WhatsApp recusou o código. Renovação automática interrompida.')
            this.emit('pairing_error', reason)
          }],
        ]) {
          if (!await this.pupPage.evaluate(name => typeof window[name] === 'function', name)) await this.pupPage.exposeFunction(name, callback)
        }
        return await this.pupPage.evaluate(requestCodeInPage, phoneNumber, showNotification, intervalMs)
      }
      catch {
        // 1.34.7 invokes this without awaiting or catching its promise. A
        // rejected code request must not become a process-wide rejection.
        report(new Date().toISOString(), 'Falha ao solicitar código; gere novamente ou use QR Code. Navegador preservado.')
        this.emit('pairing_error', 'failed')
        return null
      }
    }
    async initWebVersionCache() {
      await super.initWebVersionCache()
      const userAgent = (await this.pupBrowser.userAgent()).replace('HeadlessChrome/', 'Chrome/')
      await this.pupPage.setUserAgent(userAgent)
      // whatsapp-web.js 1.34.7 navigates with waitUntil=load and timeout=0.
      // Bound that initial navigation; inject() separately waits for WA itself.
      const page = this.pupPage
      // 1.34.7 reinjects for every frame, including embedded frames. Only a
      // main-document navigation replaces the WhatsApp integration context.
      // EventEmitter does not catch rejected async navigation listeners.
      const originalOn = page.on
      page.on = function (event, listener) {
        if (event !== 'framenavigated') return originalOn.call(this, event, listener)
        return originalOn.call(this, event, frame => {
          if (frame !== page.mainFrame()) return
          Promise.resolve().then(() => listener(frame)).catch(error => {
            report(new Date().toISOString(), 'Falha na navegação principal do WhatsApp:', String(error?.message || error))
          })
        })
      }
      const originalGoto = page.goto
      page.goto = async function (url, options) {
        page.goto = originalGoto
        report(new Date().toISOString(), 'Abrindo WhatsApp; aguardando conteúdo inicial.')
        return originalGoto.call(page, url, { ...options, waitUntil: 'domcontentloaded', timeout: 120000 })
      }
    }
    inject() {
      if (this.pendingInjection) return this.pendingInjection
      this.pendingInjection = this.injectOnce().finally(() => { this.pendingInjection = null })
      return this.pendingInjection
    }
    async injectOnce() {
      report(new Date().toISOString(), 'Conteúdo carregado; inicializando integração WhatsApp.')
      for (let attempt = 0; ; attempt++) {
        try {
          await this.pupPage.waitForFunction('window.Debug?.VERSION != undefined', { timeout: this.options.authTimeoutMs || 120000 })
          report(new Date().toISOString(), 'Contexto WhatsApp disponível; aguardando autenticação ou código.')
          // Restoring an authenticated session can take several minutes.
          // Keep navigation/context deadlines separate from synchronization.
          return await bounded(super.inject(), synchronizationTimeoutMs)
        } catch (error) {
          report(new Date().toISOString(), 'Falha ao inicializar WhatsApp:', String(error?.message || error))
          if (attempt >= 2 || !/execution context was destroyed|detached\s+frame/i.test(String(error?.message || error)) || this.pupPage.isClosed()) throw error
          report(new Date().toISOString(), 'Página navegou durante inicialização; retomando no novo contexto.', attempt + 1)
        }
      }
    }
  }
}
