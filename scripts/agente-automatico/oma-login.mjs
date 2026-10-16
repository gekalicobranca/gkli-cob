export async function entrarPeloFormularioOma(page, usuario, senha) {
  if (!usuario || !senha) throw new Error('Credenciais OMA não configuradas.')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('https://oma.com.br/condominios/', { waitUntil: 'domcontentloaded' })
  await page.locator('.e-n-accordion-item-title-text').filter({ hasText: /^\s*Condomínios\s*$/ }).filter({ visible: true }).first().click()
  const form = page.locator('form[action="https://app.winker.com.br/intra/default/login?wl=oma"]').filter({ visible: true }).first()
  await form.locator('input[name="LoginForm[username]"]').fill(usuario)
  await form.locator('input[name="LoginForm[password]"]').fill(senha)
  await form.locator('button[type="submit"]').click()
  await page.waitForURL(url => url.hostname === 'app.winker.com.br', { timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  if (/Usuário ou senha estão incorretos|Acesso inválido/i.test(await page.locator('body').innerText())) throw new Error('O formulário da OMA recusou o acesso. Revise as credenciais no portal da administradora.')
  await page.waitForURL(/\/intra\/default\/escolherPortal/i, { timeout: 60_000 })
  return page
}
