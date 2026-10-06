const normalizar = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

export function centavos(texto, vazio = null) {
  const valor = String(texto ?? '').replace(/R\$/g, '').replace(/\s/g, '')
  if (!valor) return vazio
  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(valor)) throw new Error(`Valor monetário inválido: ${texto}`)
  const [inteiro, decimal] = valor.replace(/\./g, '').split(',')
  return (Math.abs(Number(inteiro)) * 100 + Number(decimal)) * (valor.startsWith('-') ? -1 : 1)
}

export function expandirLinha(celulas) {
  return celulas.flatMap((celula) => [String(celula.texto ?? '').replace(/\s+/g, ' ').trim(), ...Array(Math.max(0, Number(celula.colspan || 1) - 1)).fill('')])
}

export function interpretarTabela(linhas, { vazioConfirmado = false } = {}) {
  const cabecalho = linhas.findIndex((r) => {
    const c = expandirLinha(r).map(normalizar)
    return c[0] === 'bloco' && c[1] === 'unidade' && c[2] === 'processo' && c[5] === 'parcela'
  })
  if (cabecalho < 0) throw new Error('Cabeçalho do relatório de acordos não reconhecido.')
  const acordos = []
  let atual = null
  let totalGeral = null
  for (const linha of linhas.slice(cabecalho + 1)) {
    const c = expandirLinha(linha)
    if (c.every((v) => !v)) continue
    if (normalizar(c[0]).includes('total geral')) {
      totalGeral = { valor_centavos: centavos(c[7], 0), recebido_centavos: centavos(c[9], 0), saldo_centavos: centavos(c[10], 0) }
      continue
    }
    if (normalizar(c[0]).includes('total')) {
      if (!atual) throw new Error('Subtotal sem acordo correspondente.')
      atual.total = { valor_centavos: centavos(c[7], 0), recebido_centavos: centavos(c[9], 0), saldo_centavos: centavos(c[10], 0), percentual_quitado: c[11] || null }
      atual = null
      continue
    }
    // O portal também usa rótulos como ENTRADA, BLOQ/JUDICIAL e 26 A 41/120.
    // Preserva o texto original; o vínculo, a data, as moedas e os totais validam a linha.
    if (c.length !== 12 || !c[5] || !/^\d{2}\/\d{2}\/\d{4}$/.test(c[6])) {
      throw new Error('Linha inesperada no relatório; coleta interrompida para evitar dados incompletos.')
    }
    if (c[2]) {
      if (atual) throw new Error('Acordo anterior sem subtotal.')
      atual = { bloco: c[0], unidade: c[1], processo: c[2], periodo: c[3], valor_principal_centavos: centavos(c[4]), parcelas: [] }
      acordos.push(atual)
    }
    if (!atual) throw new Error('Parcela sem identificação do acordo.')
    atual.parcelas.push({ parcela: c[5], vencimento: c[6], valor_centavos: centavos(c[7]), data_recebimento: c[8] || null, recebido_centavos: centavos(c[9], 0) })
  }
  if (atual) throw new Error('Acordo sem subtotal final.')
  const soma = { valor_centavos: 0, recebido_centavos: 0, saldo_centavos: 0 }
  for (const acordo of acordos) {
    for (const campo of Object.keys(soma)) soma[campo] += acordo.total[campo]
    const valorParcelas = acordo.parcelas.reduce((a, p) => a + p.valor_centavos, 0)
    const recebidoParcelas = acordo.parcelas.reduce((a, p) => a + p.recebido_centavos, 0)
    if (valorParcelas !== acordo.total.valor_centavos || recebidoParcelas !== acordo.total.recebido_centavos || valorParcelas - recebidoParcelas !== acordo.total.saldo_centavos) {
      throw new Error(`Valores das parcelas divergem do subtotal do processo ${acordo.processo}.`)
    }
  }
  if (totalGeral && Object.keys(soma).some((campo) => soma[campo] !== totalGeral[campo])) throw new Error('Soma dos acordos diverge do total geral do portal.')
  if (!totalGeral && (acordos.length || !vazioConfirmado)) throw new Error('Relatório sem total geral; não é possível confirmar a coleta completa.')
  return { quantidade_acordos: acordos.length, quantidade_parcelas: acordos.reduce((n, a) => n + a.parcelas.length, 0), total: totalGeral || soma, acordos }
}

export function agruparCondominios(condominios, codigo) {
  const grupos = new Map()
  for (const c of condominios) {
    if (!c.id || !c.nome || !/^\d+$/.test(c.codigo_cliente) || c.status !== 'ativo') throw new Error('Lista de condomínios inválida ou contendo inativo.')
    const chave = c.codigo_cliente.replace(/^0+(?=\d)/, '')
    if (codigo && chave !== String(codigo).replace(/^0+(?=\d)/, '')) continue
    if (!grupos.has(chave)) grupos.set(chave, { codigo_cliente: c.codigo_cliente, condominios: [] })
    grupos.get(chave).condominios.push({ id: c.id, nome: c.nome })
  }
  if (codigo && !grupos.size) throw new Error(`Código ${codigo} não consta na lista ativa da Manager.`)
  return [...grupos.values()]
}

export function htmlRelatorio(grupo, linhas, resultado, coletadoEm) {
  const escapar = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const moeda = (v) => (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const tabela = linhas.map((r, i) => `<tr>${r.map((c) => `<${i === 0 ? 'th' : 'td'} colspan="${Number(c.colspan || 1)}">${escapar(c.texto)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`)
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acordos Manager ${escapar(grupo.codigo_cliente)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#172a3a}h1{font-size:19px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd4dc;padding:5px;text-align:right}th{background:#eaf0f5}thead{display:table-header-group}tr{break-inside:avoid}td:nth-child(4){text-align:left}p{line-height:1.5}</style><h1>Manager — Acordos em aberto</h1><p>${grupo.condominios.map((c) => escapar(c.nome)).join('<br>')}<br>Código: ${escapar(grupo.codigo_cliente)} · Coletado em: ${escapar(coletadoEm)}</p><p>${resultado.quantidade_acordos} acordos · ${resultado.quantidade_parcelas} parcelas · Valor: ${moeda(resultado.total.valor_centavos)} · Recebido no portal: ${moeda(resultado.total.recebido_centavos)} · Saldo: ${moeda(resultado.total.saldo_centavos)}</p><table><thead>${tabela[0]}</thead><tbody>${tabela.slice(1).join('')}</tbody></table><p>Fonte: Manager / Atentum — Acompanhamento de Acordo: Somente em Aberto. O período do débito não representa necessariamente a data de criação do acordo. Valores recebidos são os informados pela administradora.</p></html>`
}
