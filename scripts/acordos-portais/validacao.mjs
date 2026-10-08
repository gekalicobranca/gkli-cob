import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export function normalizar(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function totalBbzZerado(texto) {
  const valores = String(texto).match(/-?\d[\d.]*,\d{2}/g) ?? []
  return /Total Geral/i.test(texto) && valores.length > 0 && valores.every(v => Number(v.replace(/\./g, '').replace(',', '.')) === 0)
}

export function validarTexto(texto, { portal, codigo, condominio, sem_acordos_confirmado }) {
  const t = normalizar(texto)
  if (!t.includes(normalizar(condominio))) throw new Error('O documento não identifica o condomínio solicitado.')
  if (portal === 'lello') {
    if (!t.includes('ACORDOS EM ANDAMENTO')) throw new Error('Documento Lello não é o relatório de acordos em andamento.')
    if (!new RegExp(`(?:^|\\s)0*${codigo}\\s*-`).test(t)) throw new Error('Código Lello divergente no documento.')
    const vazio = sem_acordos_confirmado && t.includes('SEM ACORDOS CONFIRMADO PELO PORTAL') && t.includes('NAO EXISTE ACORDOS EM ANDAMENTO PARA ESTE CONDOMINIO')
    if (!vazio && (!t.includes('RESUMO') || !t.includes('VALOR EM ABERTO'))) throw new Error('Relatório Lello incompleto.')
  } else if (portal === 'hflex') {
    if (!/ACORDO[S]?\s+DETALHADO|DETALHADO[S]?\s+DE\s+ACORDO/.test(t)) throw new Error('Documento HFlex não é relatório detalhado de acordos.')
    if (!new RegExp(`(?:^|\\s)0*${Number(codigo)}\\s*-`).test(t)) throw new Error('Código HFlex divergente no documento.')
    if (!t.includes('PARCELA') || !t.includes('VENCIMENTO')) throw new Error('Relatório HFlex não apresenta o detalhe de parcelas e vencimentos.')
  } else {
    if (!t.includes('ACOMPANHAMENTO DE ACORDO: ABERTO E BAIXADO')) throw new Error('Filtro BBZ inesperado.')
    const vazio = sem_acordos_confirmado && t.includes('SEM ACORDOS CONFIRMADO PELO PORTAL') && t.includes('NAO HA ACORDOS REGISTRADOS.')
    if (!vazio && !t.includes('TOTAL GERAL')) throw new Error('Relatório BBZ sem total geral; não será tratado como vazio.')
    if (/PARAMETRO INVALIDO/.test(t)) throw new Error('O relatório BBZ ainda apresenta Parâmetro Inválido.')
  }
}

export async function validarPdf(buffer, config) {
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('O portal não retornou um PDF.')
  const pdf = await pdfParse(buffer)
  if (!pdf.numpages) throw new Error('PDF sem páginas.')
  validarTexto(pdf.text, config)
  return { paginas: pdf.numpages, texto: pdf.text }
}
