export async function navegarGraiche(page, { usuario, senha, titulo, log = async () => {} }) {
  for (let passo = 0; passo < 12; passo++) {
    await page.waitForLoadState('domcontentloaded')
    const cotas = page.getByText(/Cotas Pendentes Online/i, { exact: true }).first()
    if (await cotas.isVisible()) {
      if (!titulo || (await page.title()).trim() !== titulo.trim()) throw new Error('Condomínio do portal não validado para esta receita; revisar configuração antes da coleta.')
      return cotas
    }
    if (await page.getByText(/identifique-se corretamente/i).first().isVisible()) throw new Error('Login recusado pela Graiche.')
    const password = page.locator('input[type="password"]').first()
    if (await password.isVisible()) {
      await log('Preenchendo acesso da administradora.')
      await page.locator('input[type="text"]').first().fill(usuario)
      await password.fill(senha)
      await page.getByRole('button', { name: /Entrar/i }).click()
    } else if (await page.getByText(/Relação de Condomínios/i).first().isVisible()) {
      await log('Selecionando o condomínio validado.')
      const nome = page.getByText(titulo, { exact: true }).first()
      await nome.waitFor({ state: 'visible', timeout: 15000 })
      const card = nome.locator('xpath=ancestor::*[.//a[normalize-space()="Acessar"] or .//button[normalize-space()="Acessar"]][1]')
      await card.getByText('Acessar', { exact: true }).click()
    } else {
      const campo = page.locator('input[type="text"], input[type="email"]').first()
      await campo.waitFor({ state: 'visible', timeout: 15000 })
      await log('Passando pela tela inicial de identificação.')
      await campo.fill(usuario)
      await page.getByRole('button', { name: /Entrar|Continuar|Avançar|Acessar/i }).first().click()
    }
    await page.waitForTimeout(1000)
  }
  throw new Error('Navegação Graiche excedeu as etapas esperadas de acesso e seleção do condomínio.')
}
