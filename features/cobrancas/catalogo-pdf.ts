import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import type { CondominioCatalogo } from './catalogo'

const W = 595.28, H = 841.89, X = 40, WIDTH = W - 80, BOTTOM = 55
const ink = rgb(.07, .17, .23), teal = rgb(0, .40, .48), muted = rgb(.36, .42, .46), soft = rgb(.94, .97, .98)
const clean = (value: unknown) => String(value ?? '').normalize('NFC').replace(/[–—]/g, '-').replace(/[^\x20-\x7e\xa0-\xff]/g, ' ')
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (v: string) => v.slice(0, 10).split('-').reverse().join('/')

export async function gerarCatalogoPdf(grupos: CondominioCatalogo[], dataBase: string) {
  const doc = await PDFDocument.create()
  const normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage, y = 0
  const starts: number[] = []
  function wrap(value: string, width = WIDTH, size = 10, heavy = false) {
    const font = heavy ? bold : normal, lines: string[] = []; let line = ''
    for (const word of clean(value).split(/\s+/)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = '' }
      for (const char of (line ? ' ' : '') + word) {
        if (font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = '' }
        line += char
      }
    }
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }
  function draw(value: string, x: number, at: number, size = 10, heavy = false, color = ink) {
    page.drawText(clean(value), { x, y: at, size, font: heavy ? bold : normal, color })
  }
  function newPage(label: string) {
    page = doc.addPage([W, H]); y = H - 65
    draw('GKLI  /  CATÁLOGO DE COBRANÇA', X, H - 30, 8, true, teal)
    draw(label, X, H - 44, 8, false, muted)
  }
  function paragraph(value: string, size = 10, heavy = false, continuation = 'Continuação') {
    for (const line of wrap(value, WIDTH, size, heavy)) {
      if (y < BOTTOM + size + 4) newPage(continuation)
      draw(line, X, y - size, size, heavy); y -= size + 5
    }
    y -= 5
  }
  const widths = [130, 125, WIDTH - 255]
  function tableRow(values: string[], header = false) {
    const lines = values.map((v, i) => wrap(v, widths[i] - 16, 9, header))
    const height = Math.max(...lines.map(v => v.length)) * 13 + 12
    page.drawRectangle({ x: X, y: y - height, width: WIDTH, height, color: header ? teal : soft })
    let x = X
    lines.forEach((cell, i) => {
      cell.forEach((line, j) => draw(line, x + 8, y - 16 - j * 13, 9, header, header ? rgb(1, 1, 1) : ink)); x += widths[i]
    }); y -= height
  }
  for (const grupo of grupos) {
    starts.push(doc.getPageCount())
    newPage('Unidades e cotas em cobrança')
    const context = `${grupo.carteira} / ${grupo.nome}`
    paragraph(grupo.carteira, 10, true); paragraph(grupo.nome, 19, true)
    paragraph(`${grupo.unidades.length} unidades | Total na regra: ${money(grupo.total)} | Regra D+${grupo.dias}`, 10)
    for (const unidade of grupo.unidades) {
      const title = `Unidade ${unidade.dados?.identificacao || 'não informada'} | Bloco ${unidade.dados?.bloco || '-'} | ${unidade.juridico ? 'JURÍDICO' : unidade.pre ? 'PRÉ-JURÍDICO' : 'COBRANÇA'}`
      if (y < BOTTOM + 195) { newPage('Continuação do condomínio'); paragraph(context, 11, true) }
      paragraph(title, 12, true, title)
      paragraph(`Responsável: ${unidade.dados?.responsavel_nome || 'Não informado'}`, 10, false, title)
      paragraph(`Celular: ${unidade.dados?.telefone || 'Não informado'} | E-mail: ${unidade.dados?.email || 'Não informado'}`, 9, false, title)
      paragraph(`Inadimplência na regra: ${money(unidade.total)} | ${unidade.cotas.length} cotas`, 10, true, title)
      if (y < BOTTOM + 55) { newPage('Continuação das cotas'); paragraph(context, 10, true); paragraph(title, 11, true) }
      tableRow(['Competência', 'Vencimento', 'Valor atualizado'], true)
      for (const cota of unidade.cotas) {
        const values = [cota.competencia || '-', date(cota.vencimento), money(cota.centavos)]
        const height = Math.max(...values.map((v, i) => wrap(v, widths[i] - 16, 9).length)) * 13 + 12
        if (y - height < BOTTOM) {
          newPage('Continuação das cotas'); paragraph(context, 10, true); paragraph(title, 11, true)
          tableRow(['Competência', 'Vencimento', 'Valor atualizado'], true)
        }
        tableRow(values)
      }
      y -= 20
    }
  }
  // O índice é paginado antes de calcular os números finais das seções.
  const carteiras = [...new Set(grupos.map(g => g.carteira))]
  const cover: [string, number, boolean][] = [
    ['Catálogo de cobrança', 27, true],
    [`Data-base: ${date(dataBase)}`, 11, false],
    [carteiras.length === 1 ? `Carteira: ${carteiras[0]}` : `${carteiras.length} carteiras - identificação no índice`, 12, true],
    [`${grupos.length} condomínios | ${grupos.reduce((s, g) => s + g.unidades.length, 0)} unidades`, 11, false],
    [`Inadimplência na regra: ${money(grupos.reduce((s, g) => s + g.total, 0))}`, 17, true],
    ['Carteiras e condomínios em ordem alfabética. Unidades por valor decrescente. Cotas vencidas dentro do prazo de cobrança do condomínio; excluídas as quitadas, renegociadas, suspensas e vinculadas a status de acordo.', 9, false],
    ['Indicativos: JURÍDICO, PRÉ-JURÍDICO ou COBRANÇA, conforme o cadastro. Valores atualizados registrados no sistema.', 9, false],
  ]
  const indexTop = H - 65 - cover.reduce((sum, [value, size, heavy]) => sum + wrap(value, WIDTH, size, heavy).length * (size + 5) + 5, 0) - 20
  const toc: { lines: string[]; group: number; height: number }[][] = [[]]
  let free = indexTop - 25 - BOTTOM
  grupos.forEach((g, group) => {
    const lines = wrap(`${g.carteira} / ${g.nome}`, WIDTH - 55, 10)
    const height = lines.length * 15 + 12
    if (free < height) { toc.push([]); free = 660 }
    toc[toc.length - 1].push({ lines, group, height }); free -= height
  })
  toc.forEach((entries, index) => {
    page = doc.insertPage(index, [W, H]); y = H - 65
    draw('GKLI  /  OPERAÇÃO DE COBRANÇA', X, H - 35, 9, true, teal)
    if (index === 0) {
      cover.forEach(([value, size, heavy]) => paragraph(value, size, heavy))
      y = indexTop
    }
    paragraph(index === 0 ? 'Índice por carteira e condomínio' : 'Índice - continuação', 15, true)
    entries.forEach(entry => {
      entry.lines.forEach((line, i) => draw(line, X, y - 10 - i * 15))
      draw(String(starts[entry.group] + toc.length + 1), W - X - 28, y - 10, 10, true, teal)
      y -= entry.height
    })
    if (!grupos.length) paragraph('Nenhuma cota elegível para os filtros selecionados.', 11)
  })
  const pages = doc.getPages()
  pages.forEach((p, index) => {
    page = p
    draw('Uso interno | Dados de cobrança e contato', X, 28, 8, false, muted)
    draw(`${index + 1} / ${pages.length}`, W - X - 55, 28, 8, false, muted)
  })
  doc.setTitle('Catálogo de cobrança'); doc.setAuthor('GKLI')
  return doc.save()
}
