// Runs inside WhatsApp's page. Classify errors here: Puppeteer otherwise loses
// the nested IQErrorRateOverlimit details when serializing the rejection.
export async function requestCodeInPage(phoneNumber, showNotification, intervalMs) {
  clearInterval(window.codeInterval)
  window.codeInterval = undefined
  const getCode = async () => {
    try {
      const api = window.AuthStore.PairingCodeLinkUtils
      api.setPairingType('ALT_DEVICE_LINKING')
      await api.initializeAltDeviceLinking()
      const code = await api.startAltLinkingFlow(phoneNumber, showNotification)
      await window.onCodeReceivedEvent(code)
      return code
    } catch (error) {
      clearInterval(window.codeInterval)
      window.codeInterval = undefined
      const limited = error?.type?.name === 'IQErrorRateOverlimit' || error?.type?.value?.code === 429
      await window.onPairingFailureEvent(limited ? 'rate_limit' : 'failed')
      return null
    }
  }
  const code = await getCode()
  if (code) window.codeInterval = setInterval(async () => {
    const state = window.AuthStore.AppState.state
    if (state !== 'UNPAIRED' && state !== 'UNPAIRED_IDLE') {
      clearInterval(window.codeInterval)
      window.codeInterval = undefined
      return
    }
    await getCode()
  }, intervalMs)
  return code
}
