import test from 'node:test'
import assert from 'node:assert/strict'
import { navegarGraiche } from './graiche-navegacao.mjs'

function portal(titulo = 'JERIVAS') {
  let etapa = 0
  const clicks = []
  const locator = (tipo) => ({
    first() { return this },
    async isVisible() { return tipo === ['campo', 'senha', 'lista', 'cotas'][etapa] },
    async waitFor() {},
    async fill() {},
    async click() { clicks.push(tipo); etapa++ },
    locator() { return locator('card') },
    getByText() { return locator('selecionar') },
  })
  return { clicks, page: {
    async waitForLoadState() {}, async waitForTimeout() {}, async title() { return titulo },
    locator(s) { return locator(s.includes('password') ? 'senha' : 'campo') },
    getByRole() { return locator('entrar') },
    getByText(s) { const t = String(s); return locator(t.includes('Cotas') ? 'cotas' : t.includes('Relação') ? 'lista' : t.includes('identifique') ? 'erro' : 'nome') },
  } }
}
test('passa pela identificação, login e seleção antes das cotas', async () => {
  const {page,clicks} = portal()
  await navegarGraiche(page,{usuario:'teste',senha:'teste',titulo:'JERIVAS'})
  assert.deepEqual(clicks,['entrar','entrar','selecionar'])
})
test('não aceita acessar cotas de outro condomínio', async () => {
  const {page} = portal('OUTRO')
  await assert.rejects(navegarGraiche(page,{usuario:'teste',senha:'teste',titulo:'JERIVAS'}),/não validado/)
})
