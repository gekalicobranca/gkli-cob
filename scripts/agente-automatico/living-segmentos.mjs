export const LIVING_SEGMENTOS = [
  { codigo: '1679', nome: 'LIVING WELLNESS ACLIMACAO CENTRAL', blocos: [] },
  { codigo: '1680', nome: 'LIVING WELLNESS ACLIMACAO - SUBCOND 1', blocos: ['A', 'B'] },
  { codigo: '1681', nome: 'LIVING WELLNESS ACLIMACAO - SUBCOND 2', blocos: ['C'] },
  { codigo: '1682', nome: 'LIVING WELLNESS ACLIMACAO - SUBCOND 3', blocos: ['LJ'] },
  { codigo: '1683', nome: 'LIVING WELLNESS ACLIMACAO - SUBCOND 4', blocos: [] },
]

export function consolidarLiving(partes) {
  if (partes.length !== LIVING_SEGMENTOS.length || new Set(partes.map(p => p.codigo)).size !== partes.length) throw new Error('Coleta Living incompleta ou repetida.')
  const relatorios = []
  for (const segmento of LIVING_SEGMENTOS) {
    const parte = partes.find(p => p.codigo === segmento.codigo)
    if (!parte) throw new Error('Subcondomínio ausente: ' + segmento.codigo)
    const texto = parte.bytes.toString('latin1')
    if (!new RegExp('Condom.nio:\\s*' + segmento.codigo + '\\s*-', 'i').test(texto)) throw new Error('Relatório de outro subcondomínio: ' + segmento.codigo)
    if (!/N.o consta pend.ncia/i.test(texto)) relatorios.push(parte.bytes)
  }
  const manifest = Buffer.from(JSON.stringify(LIVING_SEGMENTOS)).toString('base64')
  return Buffer.concat([Buffer.from('<html><!--GKLI_LIVING:' + manifest + '-->\n'), ...(relatorios.length ? relatorios : [partes[0].bytes]), Buffer.from('</html>')])
}

export async function coletarLiving(page, context, relacaoUrl) {
  const partes = []
  for (const segmento of LIVING_SEGMENTOS) {
    await page.goto(relacaoUrl, { waitUntil: 'domcontentloaded' })
    const card = page.locator('div.card').filter({ hasText: segmento.nome })
    await card.getByText('Acessar', { exact: true }).click()
    await page.waitForTimeout(1200)
    await page.goto(new URL('/bin/rt/rtPendentes.asp', page.url()).href, { waitUntil: 'domcontentloaded' })
    const unidades = page.locator('select').first()
    await unidades.waitFor({ state: 'visible' })
    const label = (await unidades.locator('option').allTextContents()).find(t => /Todas.*Unidades/i.test(t))
    if (!label) throw new Error('Todas as unidades indisponível: ' + segmento.codigo)
    await unidades.selectOption({ label })
    await page.getByRole('button', { name: /Consultar|Avançar/i }).or(page.getByText(/Consultar|Avançar/i)).first().click()
    const exportar = page.getByText(/Exportar Excel/i).first()
    await exportar.waitFor({ state: 'visible', timeout: 60000 })
    const body = await page.locator('body').innerText()
    if (!body.includes(segmento.codigo + ' - ' + segmento.nome)) throw new Error('Identidade do subcondomínio divergente.')
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 })
    await exportar.click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks = []; for await (const chunk of stream) chunks.push(chunk)
    partes.push({ codigo: segmento.codigo, bytes: Buffer.concat(chunks) })
    await download.delete()
    console.log('Living: relatório validado', segmento.codigo)
  }
  return consolidarLiving(partes)
}
