import { readFile } from 'node:fs/promises'
import { normalizar } from './validacao.mjs'

export const HFLEX_LOGIN_URL = 'https://sys.livefacilities.com.br/Index.aspx'
export const HFLEX_LISTA_URL = 'https://sys.livefacilities.com.br/Operacional/Empreendimento/Emp_BoletoAcordolista.aspx?menu=MKvPqNDN3JSoAv4X/J1moA=='

export function validarContextoHflex(texto, config) {
  const esperado = `${config.codigo} - ${normalizar(config.condominio)}`
  if (normalizar(texto) !== esperado) throw new Error('Empreendimento HFlex divergente do cadastro solicitado.')
}

export function validarUrlRelatorioHflex(url) {
  const parsed = new URL(url)
  if (parsed.origin !== 'https://sys.livefacilities.com.br' || parsed.pathname !== '/Operacional/Relatorio/RelatorioAcordoDetalhado.aspx' || !parsed.searchParams.get('p')) {
    throw new Error('A janela aberta não é o relatório detalhado de acordos HFlex.')
  }
}

export async function coletarHflex(page, config, acesso) {
  await page.goto(HFLEX_LOGIN_URL, { waitUntil: 'domcontentloaded' })
  if (await page.getByPlaceholder('login', { exact: true }).isVisible()) {
    await page.getByPlaceholder('login', { exact: true }).fill(acesso.usuario)
    await page.getByPlaceholder('senha', { exact: true }).fill(acesso.senha)
    await page.getByRole('button', { name: /^Entrar$/i }).click()
  }
  await page.getByRole('button', { name: /^Acessar$/i }).waitFor({ state: 'visible' })
  const perfil = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'ADVOGADO EXTERNO' }) })
  await perfil.selectOption({ label: 'ADVOGADO EXTERNO' })
  await page.getByRole('button', { name: /^Acessar$/i }).click()
  await page.waitForURL(/\/Operacional\//i)
  const empreendimento = page.locator('#tbNmEmpreendimento')
  await empreendimento.fill(config.codigo)
  await empreendimento.press('Enter')
  await page.waitForFunction(({codigo,nome}) => {
    const valor = document.querySelector('#tbNmEmpreendimento')?.value || ''
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g,' ').trim().toUpperCase()
    return normalize(valor) === `${codigo} - ${normalize(nome)}`
  }, { codigo: config.codigo, nome: config.condominio })
  validarContextoHflex(await empreendimento.inputValue(), config)
  await page.locator('#lkHomeEmpreendimento').click()
  await page.goto(HFLEX_LISTA_URL, { waitUntil: 'domcontentloaded' })
  validarContextoHflex(await empreendimento.inputValue(), config)
  await page.locator('#body_tbNumeroAcordo').fill('')
  await page.locator('#body_tbDataInicioVencimento').fill('')
  await page.locator('#body_tbDataFinalVencimento').fill('')
  await page.locator('#body_ddBloco').selectOption({ label: '---' })
  await page.locator('#body_ddUnidade').selectOption({ label: '---' })
  await page.getByRole('checkbox', { name: 'TODOS STATUS', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Exibir acordos de unidades', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Exibir acordos de contrato', exact: true }).check()
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
  await page.locator('#tblListaBoletoFooter').waitFor({ state: 'visible' })
  // Parâmetros criptografados pertencem à sessão: nunca reutilizar uma URL copiada.
  const popupPromise = page.waitForEvent('popup', { timeout: 120000 })
  popupPromise.catch(() => {})
  await page.getByRole('button', { name: 'Relatório Detalhado', exact: true }).click()
  const popup = await popupPromise
  try {
    await popup.waitForLoadState('domcontentloaded')
    validarUrlRelatorioHflex(popup.url())
    await popup.getByText(/ACORDO.*DETALHADO|DETALHADO.*ACORDO/i).first().waitFor({ state: 'visible' })
    const exportar = popup.locator('a,button,input[type=button],input[type=submit]').filter({ has: popup.locator('i[class*="file-pdf"]') })
      .or(popup.locator('[title*="PDF" i]:visible, a[href$=".pdf" i]:visible'))
    if (await exportar.count() !== 1) throw new Error('Exportação PDF HFlex requer validação do controle no visualizador. Nenhum documento foi publicado.')
    const downloadPromise = popup.waitForEvent('download', { timeout: 120000 })
    downloadPromise.catch(() => {})
    await exportar.click()
    const download = await downloadPromise
    const arquivo = await download.path()
    if (!arquivo) throw new Error('PDF HFlex não foi disponibilizado.')
    validarContextoHflex(await empreendimento.inputValue(), config)
    return { pdf: await readFile(arquivo), filtro: 'todos_status', evidencia_html: await page.locator('#tblListaBoletoFooter').innerText() }
  } finally { await popup.close() }
}
