import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { aguardarCondominioSelecionado } from './lello-selecao.mjs'

test('Safira: aguarda cabeçalho desabilitado e ignora opções ocultas e códigos parciais', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<a style="display:none">63004 - SAFIRA</a><button data-toggle="dropdown">163004 - OUTRO</button>')
    assert.equal(await aguardarCondominioSelecionado(page, '63004', 150), false)
    await page.evaluate(() => setTimeout(() => {
      const button = document.querySelector('button')
      button.textContent = '63004 - SAFIRA'
      button.disabled = true
    }, 350))
    assert.equal(await aguardarCondominioSelecionado(page, '63004', 2_000), true)
    await page.locator('button').evaluate(el => { el.style.display = 'none' })
    assert.equal(await aguardarCondominioSelecionado(page, '63004', 150), false)
  } finally {
    await browser.close()
  }
})
