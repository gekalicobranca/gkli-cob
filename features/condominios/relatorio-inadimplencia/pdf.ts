import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { AnaliseInadimplencia, ContextoRelatorio, DISCLAIMER, UnidadeRelatorio, chaveUnidade, consolidar, cortes, estadoProcesso, marcaEscritorio } from './modelo'
import { descricaoLimitacaoJur } from './gkit-jur'

const W = 595.28, H = 841.89, X = 40, WIDTH = 515, TOP = 665, BOTTOM = 130
const purple = '#3B2049', green = '#E3F2E8', yellow = '#FFF1D2'
const money = (v: number | null) => v === null ? 'Não disponível' : (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = (v?: string | null) => v ? v.slice(0, 10).split('-').reverse().join('/') : 'Não informado'
const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
const clean = (v: unknown) => String(v ?? '').normalize('NFC').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\xa0-\xff\n]/g, ' ')
function marca(u: UnidadeRelatorio) {
  let m = u.processos.length ? `${u.processos.every(p => p.vinculoNoRelatorio === 'unidade') ? 'U' : 'N'}-${[...new Set(u.processos.map(marcaEscritorio))].join('/')}${u.processos.every(p => estadoProcesso(p) === 'historico') ? '\n[H]' : ''}` : u.preJuridico ? 'D' : u.conferencia?.situacao === 'judicial' ? 'J-C' : u.indicacaoApp ? 'APP' : 'S'
  if (u.conferencia?.situacao === 'pre_distribuicao') m = `D-C${u.processos.length ? '\n' + m : ''}`
  if ((u.mais5 ?? 0) > 0) m += u.processos.length ? '\n5P' : '\n5S'
  return m
}
function rowColor(u: UnidadeRelatorio) {
  if (u.conferencia?.situacao === 'pre_distribuicao') return undefined
  return u.processos.some(p => estadoProcesso(p) === 'recente') ? green : u.processos.some(p => estadoProcesso(p) === 'suspenso') ? yellow : undefined
}
export async function gerarPdfInadimplencia(analise: AnaliseInadimplencia, contexto: ContextoRelatorio, options: { nome: string; cnpj?: string; indicacoesApp?: Array<{ bloco: string; unidade: string; acaoJudicial: boolean }>; template?: Uint8Array }) {
  const doc = await PDFDocument.create(); const regular = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const template = await PDFDocument.load(options.template ?? await readFile(path.join(process.cwd(), 'public/templates/genske-papel-timbrado.pdf')))
  const original = template.getPage(0); const box = original.getMediaBox()
  const background = await doc.embedPage(original, { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height })
  let page: PDFPage, y = TOP
  function next(title?: string) {
    page = doc.addPage([W, H]); page.drawPage(background, { x: 0, y: 0, width: W, height: H }); y = TOP
    if (title) text(title, { size: 15, bold: true, gap: 12 })
  }
  function wrap(v: string, width: number, size: number, isBold = false) {
    const font = isBold ? bold : regular; const lines: string[] = []
    for (const para of clean(v).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/).filter(Boolean)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = '' }
        for (const c of (line ? ' ' : '') + word) { if (line && font.widthOfTextAtSize(line + c, size) > width) { lines.push(line); line = '' }; line += c }
      }
      lines.push(line)
    }
    return lines
  }
  function text(v: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
    const size = opts.size ?? 9, leading = size + 3
    const lines = wrap(v, WIDTH, size, opts.bold)
    if (y - lines.length * leading < BOTTOM) next()
    for (const line of lines) { if (y - leading < BOTTOM) next(); page.drawText(line, { x: X, y: y - size, size, font: opts.bold ? bold : regular, color: color('#24212A') }); y -= leading }
    y -= opts.gap ?? 7
  }
  type Row = { values: string[]; fill?: string }
  function table(headers: string[], rows: Row[], widths: number[]) {
    const fontSize = 7.5, lead = 10
    const height = (values: string[], isHead = false) => Math.max(...values.map((v, i) => wrap(v, widths[i] - 10, fontSize, isHead).length)) * lead + 10
    function draw(values: string[], bg: string, isHead = false) {
      const h = height(values, isHead); page.drawRectangle({ x: X, y: y - h, width: WIDTH, height: h, color: color(bg) }); let x = X
      values.forEach((v, i) => { wrap(v, widths[i] - 10, fontSize, isHead).forEach((line, j) => page.drawText(line, { x: x + 5, y: y - 5 - fontSize - j * lead, size: fontSize, font: isHead ? bold : regular, color: color(isHead ? '#FFFFFF' : '#24212A') })); x += widths[i] }); y -= h
    }
    if (y - height(headers, true) - (rows[0] ? height(rows[0].values) : 0) < BOTTOM) next()
    draw(headers, purple, true)
    rows.forEach((r, i) => {
      if (height(r.values) > TOP - BOTTOM - height(headers, true)) {
        // Long notes belong in paragraphs; avoid silently clipping a table row.
        throw new Error('Uma linha excede a altura de página. Reduza as observações na fonte da tabela.')
      }
      if (y - height(r.values) < BOTTOM) { next(); draw(headers, purple, true) }
      draw(r.values, r.fill ?? (i % 2 ? '#F5F2F6' : '#FFFFFF'))
    }); y -= 10
  }
  const units = consolidar(analise, contexto, options.indicacoesApp), c = cortes(analise.dataBase)
  const soma = (key: 'mais60' | 'mais5' | 'entre60e5') => units.some(u => u[key] === null) ? null : units.reduce((s, u) => s + u[key]!, 0)
  next(); text(options.nome, { size: 20, gap: 10 }); text('Relatório consolidado de inadimplência', { size: 14 })
  text(`Posição financeira: ${date(analise.dataBase)}${options.cnpj ? ` | CNPJ ${options.cnpj}` : ''}`)
  if (contexto.jurConsulta?.status === 'sucesso') text(`Consulta processual GKIT-Jur: ${date(contexto.jurConsulta.consultaProcessualEm)} | Competência ${contexto.jurConsulta.competencia ?? 'não informada'}`)
  if (contexto.jurConsulta?.status === 'erro') text(`Consulta processual GKIT-Jur indisponível em ${date(contexto.jurConsulta.consultadoEm)}. O relatório não afirma ausência de processo.`)
  text(DISCLAIMER)
  text(`${units.length} unidades | ${analise.qualidade === 'completa' ? `${analise.recibos.length} recibos` : 'Base resumida'} | Saldo atualizado: R$ ${money(analise.totais.total)}`)
  table(['Composição', 'Valor (R$)'], (['principal', 'multa', 'correcaoJuros', 'total'] as const).map((k, i) => ({ values: [['Principal', 'Multa', 'Correção e juros', 'TOTAL'][i], money(analise.totais[k])] })), [360, 155])
  table(['Faixa de vencimento', 'Unidades', 'Saldo atualizado (R$)'], [['Mais de 60 dias', 'mais60'], ['Mais de 5 anos', 'mais5'], ['Mais de 60 dias e menos de 5 anos', 'entre60e5']].map(([label, key]) => ({ values: [label, soma(key as 'mais60') === null ? 'Não disponível' : String(units.filter(u => (u[key as 'mais60'] ?? 0) > 0).length), money(soma(key as 'mais60'))] })), [290, 75, 150])
  text('As faixas são subconjuntos do saldo total e não devem ser somadas entre si. Os valores atualizados acima representam recibos completos, com todas as naturezas e encargos.')
  if (analise.qualidade === 'resumida') text(analise.observacoes[0])
  const datas = analise.recibos.map(r => r.vencimento).filter((d): d is string => Boolean(d)).sort()
  if (datas.length) text(`Vencimento mais antigo: ${date(datas[0])}. Mais recente: ${date(datas.at(-1))}.`)
  next('Critérios, conferência e legenda')
  text(`Mais de 60 dias: vencimento anterior a ${date(c.sessenta)}. Mais de 5 anos: anterior a ${date(c.cinco)}. Os limites são estritos. Não se atribui o saldo integral da unidade à idade do vencimento mais antigo.`)
  if (analise.dataBaseInferida) text('Não havia data no nome do arquivo; foi adotada a data de geração. Informe a data-base ao anexar as fontes, se necessário.')
  const limitacaoJur = descricaoLimitacaoJur(contexto)
  if (limitacaoJur) text(limitacaoJur)
  for (const note of analise.observacoes) text(note)
  table(['Marcação', 'Significado'], [
    ['J-C / D-C', 'Judicial / pré-distribuição conforme conferência fornecida pelo solicitante. Consulte a seção de conferências; não confirma os débitos abrangidos por um processo.'],
    ['N', 'Processo relacionado por nome. Unidade e vencimentos abrangidos precisam de confirmação.'], ['G / O / NI', 'Genske Advogados / outro escritório informado / escritório não identificado. Lidiane Genske Baia = Genske, conforme confirmação do solicitante.'], ['D / APP', 'Pré-distribuição informada / indicação judicial no cadastro do app, sem confirmação de situação processual.'], ['[H]', 'Somente processos extintos, cancelados ou arquivados relacionados.'], ['5P / 5S', 'Saldo com mais de 5 anos com / sem processo relacionado identificado. Não é conclusão sobre prescrição.'], ['S', 'Sem correspondência nos dados disponíveis; não comprova ausência de ação.'], ['Verde', 'Movimentação recente informada, sem encerramento indicado. Publicação recente não confirma isoladamente andamento atual.'], ['Amarelo', 'Processo expressamente suspenso.'],
  ].map(values => ({ values, fill: values[0] === 'Verde' ? green : values[0] === 'Amarelo' ? yellow : undefined })), [95, 420])
  text('U: unidade expressamente identificada na fonte processual. O vínculo não confirma quais parcelas estão abrangidas pelo processo.')
  next('Processos e unidades acima de 60 dias')
  if (soma('mais60') === null) text('Anexe a origem detalhada para calcular os valores e as unidades por faixa de vencimento.')
  else {
    const groups = new Map<string, UnidadeRelatorio[]>()
    for (const u of units.filter(u => u.mais60! > 0)) {
      const label = u.conferencia?.situacao === 'pre_distribuicao' ? 'Pré-distribuição (conferência)' : u.processos.length ? u.processos.every(p => estadoProcesso(p) === 'historico') ? 'Processo histórico / encerrado informado' : 'Processo relacionado (conferir situação)' : u.preJuridico ? 'Pré-distribuição' : u.conferencia?.situacao === 'judicial' ? 'Judicial informado (conferência)' : u.indicacaoApp ? 'Indicação judicial no app' : 'Sem correspondência'
      groups.set(label, [...(groups.get(label) ?? []), u])
    }
    table(['Vínculo', 'Unidades', 'Saldo > 60 dias (R$)'], [...groups].map(([label, us]) => ({ values: [label, String(us.length), money(us.reduce((s, u) => s + u.mais60!, 0))] })), [300, 65, 150])
  }
  if (contexto.processos === undefined) text('Nenhuma relação de processos foi anexada. As indicações do app não substituem a conferência dos autos.')
  text(`Pré-jurídico: ${contexto.preJuridico === undefined ? 'relação não anexada' : `${contexto.preJuridico.length} registro(s) deste condomínio na fonte recebida`}.`)
  if (contexto.conferenciasUnidades?.length) {
    next('Conferências de vínculos fornecidas')
    text('Situações informadas pelo solicitante para esta posição financeira. Não representam novos retornos do GKIT-Jur nem alteram os saldos captados. Referências nominais a outros processos não confirmam o ajuizamento das cotas em pré-distribuição.')
    table(['Unidade', 'Situação informada', 'Fonte e ressalvas'], contexto.conferenciasUnidades.map(u => ({ values: [u.bloco + '/' + u.unidade, u.situacao === 'judicial' ? 'Judicial' : 'Pré-distribuição', `${u.fonte} (${date(u.conferidoEm)}). ${u.observacao ?? 'Número e débitos abrangidos sujeitos a conferência.'}`] })), [70, 100, 345])
  }
  const rowsFor = (us: UnidadeRelatorio[]) => us.map(u => ({ values: [u.bloco ? `${u.bloco}/${u.unidade}` : u.unidade, u.responsaveis.join(' / '), money(u.total), money(u.mais60), money(u.mais5), marca(u)], fill: rowColor(u) }))
  next('Relação completa de unidades')
  text('Valores atualizados dos recibos completos. As cores e marcas indicam processos relacionados ao cadastro, não confirmam a inclusão de cada débito nos autos.')
  table(['Unidade', 'Responsável', 'Saldo total', '> 60 dias', '> 5 anos', 'Marcas'], rowsFor(units), [62, 137, 82, 82, 82, 70])
  const recibosById = new Map(analise.recibos.map(r => [r.id, r]))
  const categories = [...new Set(analise.itens.map(i => i.natureza))].sort((a, b) => a === 'Taxa condominial' ? -1 : b === 'Taxa condominial' ? 1 : a.localeCompare(b, 'pt-BR'))
  for (const category of categories) {
    const its = analise.itens.filter(i => i.natureza === category); const field = analise.encargosPorNatureza ? 'total' : 'principal'
    next(`${category} - ${field === 'total' ? 'saldo atualizado' : 'principal'}`)
    text(field === 'total' ? 'Valores atualizados informados nos itens da origem.' : 'Somente principal. Encargos agrupados por recibo não foram rateados entre naturezas.')
    const semValor = its.filter(i => i[field] === null).length
    if (semValor) text(`${semValor} detalhe(s) sem valor disponível. Não foram convertidos em zero nem identificados como dívida quantificada.`)
    const totalNatureza = its.reduce((s, i) => s + (i[field] ?? 0), 0)
    text(`Total quantificado nesta natureza: R$ ${money(totalNatureza)}.`)
    const elegiveis = units.map(u => {
      const valor = its.filter(i => {
        const r = recibosById.get(i.reciboId)
        return r && chaveUnidade(r.bloco, r.unidade) === u.chave && r.vencimento && r.vencimento < c.sessenta && r.vencimento > c.cinco
      }).reduce((s, i) => s + (i[field] ?? 0), 0)
      return { u, valor }
    }).filter(r => r.valor > 0)
    const grupos = [
      ['Com processo relacionado', elegiveis.filter(r => r.u.processos.length && r.u.conferencia?.situacao !== 'pre_distribuicao')],
      ['Pré-distribuição informada', elegiveis.filter(r => r.u.conferencia?.situacao === 'pre_distribuicao' || (!r.u.processos.length && r.u.preJuridico))],
      ['Judicial informado em conferência', elegiveis.filter(r => !r.u.processos.length && r.u.conferencia?.situacao === 'judicial')],
      ['Indicação judicial no app, sem relação numerada', elegiveis.filter(r => !r.u.processos.length && !r.u.preJuridico && !r.u.conferencia && r.u.indicacaoApp)],
      ['Sem correspondência nas fontes', elegiveis.filter(r => !r.u.processos.length && !r.u.preJuridico && !r.u.conferencia && !r.u.indicacaoApp)],
    ] as const
    text('Recorte: vencidos há mais de 60 dias e menos de 5 anos.', { bold: true })
    table(['Vínculo', 'Unidades', 'Valor do recorte (R$)'], grupos.map(([label, rs]) => ({ values: [label, String(rs.length), money(rs.reduce((s, r) => s + r.valor, 0))] })), [300, 65, 150])
    const rows = units.flatMap(u => {
      const ids = new Set(analise.recibos.filter(r => chaveUnidade(r.bloco, r.unidade) === u.chave).map(r => r.id))
      const sub = its.filter(i => ids.has(i.reciboId) && i[field] !== null)
      if (!sub.some(i => i[field] !== 0)) return []
      const sum = (cut?: string) => sub.filter(i => !cut || (recibosById.get(i.reciboId)?.vencimento ?? '9999') < cut).reduce((s, i) => s + i[field]!, 0)
      return [{ values: [u.bloco ? `${u.bloco}/${u.unidade}` : u.unidade, u.responsaveis.join(' / '), money(sum()), money(sum(c.sessenta)), money(sum(c.cinco)), marca(u)], fill: rowColor(u) }]
    })
    if (rows.length) table(['Unidade', 'Responsável', 'Valor total', '> 60 dias', '> 5 anos', 'Marcas'], rows, [62, 137, 82, 82, 82, 70])
    else text('Nenhum valor não nulo quantificado nesta natureza.')
  }
  if (units.some(u => (u.mais5 ?? 0) > 0)) { next('Débitos com mais de 5 anos'); table(['Unidade', 'Responsável', 'Saldo total', '> 60 dias', '> 5 anos', 'Marcas'], rowsFor(units.filter(u => (u.mais5 ?? 0) > 0)), [62, 137, 82, 82, 82, 70]) }
  for (const propria of [true, false]) {
    next(propria ? 'Cadastro de cobranças e execuções' : 'Demais processos - informação adicional')
    const ps = (contexto.processos ?? []).filter(p => p.cobrancaPropria === propria)
    if (!ps.length) text(propria ? 'Nenhum processo de cobrança numerado informado nas fontes disponíveis.' : 'Nenhum outro processo fornecido para relacionar. Isso não comprova inexistência de outros processos.')
    for (const p of ps) {
      if (y < BOTTOM + 170) next()
      text(p.numero, { bold: true, size: 11 }); text(`Parte: ${p.parte}. Classe/assunto: ${p.classe} / ${p.assunto}. Polo: ${p.polo}.`)
      text(`Situação: ${p.situacao}. Advogado: ${p.advogado}. Escritório: ${marcaEscritorio(p).startsWith('G') ? `Genske Advogados (Lidiane), conforme confirmação do solicitante${marcaEscritorio(p) === 'G+O' ? '; também ' + p.escritorio : ''}` : p.escritorio || 'Não identificado'}.`)
      const us = units.filter(u => u.processos.some(v => v.numero === p.numero)); text(`Unidade na fonte: ${p.unidade || 'Não informada'}. ${us.length ? 'Possível vínculo: ' + us.map(u => `${u.bloco}/${u.unidade}`).join(', ') : 'Sem vínculo com os débitos atuais identificado.'}`)
      if (/quita[cç][aã]o/i.test(p.situacao + p.observacoes)) text('Conferir possível quitação: a referência no processo não foi tratada como prova de pagamento nem como autorização de baixa.')
      if (p.observacoes) text(p.observacoes)
      text(`Origem: ${p.origem}. ${p.fonte ? 'Fonte indicada: ' + p.fonte : ''}`, { size: 8 })
    }
  }
  next('Fontes e limites')
  text(`Financeiro: ${analise.arquivo}. Condomínio na origem: ${analise.condominioFonte || 'Não informado'}.`)
  for (const f of contexto.fontes ?? []) text(f)
  text(contexto.jurConsulta ? 'A relação processual é reproduzida do GKIT-Jur e do cadastro do app, sem consulta independente aos autos pelo GKLI-Cob. Correspondência nominal não confirma abrangência de unidades ou vencimentos. Valores de ação não são somados à inadimplência.' : 'A relação processual é reproduzida das fontes anexadas e do cadastro do app, sem consulta independente aos autos. Correspondência nominal não confirma abrangência de unidades ou vencimentos. Valores de ação não são somados à inadimplência. A taxa de inadimplência depende da base completa de faturamento, não disponível no ranking.')
  const pages = doc.getPages()
  pages.forEach((pg, i) => { pg.drawText(wrap(`${options.nome} | ${date(analise.dataBase)}`, 420, 7)[0], { x: X, y: 110, size: 7, font: regular, color: color(purple) }); pg.drawText(`Página ${i + 1} de ${pages.length}`, { x: 473, y: 110, size: 7, font: regular, color: color(purple) }) })
  doc.setTitle(`${options.nome} - Relatório de inadimplência`); doc.setAuthor('Genske Advogados')
  return Buffer.from(await doc.save())
}
