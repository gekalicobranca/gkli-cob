function centavos(valor) {
  if (valor == null || String(valor).trim() === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : null
}

function apurarRepasse(acordo, parcela) {
  const informado = centavos(parcela.valor_repasse_informado)
  if (informado != null) return { valor: informado, origem: 'Valor informado na parcela' }

  const despesa = centavos(acordo.despesa_cobranca_valor)
  const total = centavos(acordo.valor_acordado)
  const ativas = acordo.parcelas_acordo.filter(p => p.status !== 'cancelada').sort((a, b) => a.numero - b.numero)
  if (!(despesa > 0 && total >= despesa) || ativas.some(p => !(centavos(p.valor) > 0))
    || ativas.reduce((soma, p) => soma + centavos(p.valor), 0) !== total) return null
  if (ativas.some(p => centavos(p.valor_repasse_informado) != null)) return null

  // Rateia por diferença entre acumulados para preservar o total em centavos.
  let acumulado = 0
  for (const p of ativas) {
    const anterior = acumulado
    acumulado += centavos(p.valor)
    if (p.id === parcela.id) return {
      valor: Math.round(despesa * acumulado / total) - Math.round(despesa * anterior / total),
      origem: 'Rateio da despesa registrada no acordo',
    }
  }
  return null
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function planejarBorderoLello({ portal, app, codigo, inicio, fim, chaveUnidade }) {
  const acordosPorChave = new Map()
  const baixasPorChave = new Map()
  function incluir(indice, chave, item) {
    const itens = indice.get(chave) ?? []
    itens.push(item)
    indice.set(chave, itens)
  }
  for (const a of portal.acordos) incluir(acordosPorChave, `${chaveUnidade(a.unidade)}:${a.numero}`, a)
  for (const p of portal.pagamentos) incluir(baixasPorChave, `${chaveUnidade(p.unidade)}:${p.descricao}`, p)
  const unidades = new Map(app.unidades.map(u => [u.id, u]))
  const linhas = [], pendencias = [], usosPorRecibo = new Map()
  const noPeriodo = data => Boolean(data && data >= inicio && data <= fim)

  for (const a of app.acordos) {
    if (a.tipo === 'judicial' || a.origem_controle !== 'carteira' || ['cancelado', 'renegociado', 'quebrado'].includes(a.status)) continue
    const unidade = unidades.get(a.unidade_id)
    if (!unidade) continue
    const fonte = a.acordos_fontes_lello
    const numero = fonte?.codigo_condominio === codigo ? fonte.numero_acordo : null
    const chave = chaveUnidade(unidade.identificacao, unidade.bloco)
    const candidatos = acordosPorChave.get(`${chave}:${numero}`) ?? []
    for (const p of a.parcelas_acordo) {
      if (p.status === 'cancelada') continue
      const grade = candidatos.length === 1 ? candidatos[0].parcelas.filter(r => r.numero === p.numero) : []
      const oficial = grade.length === 1 ? grade[0] : null
      const dataBaixa = oficial?.situacao === 'Contabilizado' ? oficial.pagamento : null
      if (!noPeriodo(dataBaixa) && !noPeriodo(p.data_pagamento)) continue
      const registro = { acordoId: a.id, parcelaId: p.id, numero, unidade: unidade.identificacao,
        bloco: unidade.bloco, parcela: p.numero, quantidadeParcelas: a.parcelas_acordo.length, vencimento: p.vencimento }
      const recebimentos = baixasPorChave.get(`${chave}:Parcela ${p.numero} Acordo ${numero}`) ?? []
      const baixas = recebimentos.filter(r => r.recibo && r.pagamento === dataBaixa && r.vencimento === p.vencimento && r.valorPago === oficial?.valor)
      if (!noPeriodo(dataBaixa) || baixas.length !== 1 || oficial.vencimento !== p.vencimento || oficial.valor !== centavos(p.valor)
        || (p.data_pagamento && p.data_pagamento !== dataBaixa)) {
        pendencias.push({ ...registro, motivo: 'Baixa sem confirmação inequívoca no período ou divergente no Easy.' })
        continue
      }
      const [baixa] = baixas
      const chaveBaixa = `${chave}:${baixa.recibo}`
      usosPorRecibo.set(chaveBaixa, (usosPorRecibo.get(chaveBaixa) ?? 0) + 1)
      const repasse = apurarRepasse(a, p)
      if (!repasse) {
        pendencias.push({ ...registro, motivo: 'Pagamento confirmado. Repasse sem valor documentado ou rateio verificável.' })
        continue
      }
      const textoUnidade = unidade.bloco && !/^0+$/.test(unidade.bloco) ? `${unidade.identificacao}, bloco ${unidade.bloco}` : unidade.identificacao
      linhas.push({ ...registro, recibo: baixa.recibo, dataBaixa, valorPagoCentavos: baixa.valorPago,
        repasseCentavos: repasse.valor, origemRepasse: repasse.origem,
        descricao: `Serviços de cobrança extrajudicial — ${app.condominio.nome}, acordo ${numero}, unidade ${textoUnidade}, parcela ${p.numero}/${registro.quantidadeParcelas}, baixa de ${dataBaixa.split('-').reverse().join('/')}, repasse de ${moeda.format(repasse.valor / 100)}.` })
    }
  }

  // Uma mesma baixa em mais de um cadastro exige revisão antes de compor o total.
  const confirmadas = []
  for (const linha of linhas) {
    if (usosPorRecibo.get(`${chaveUnidade(linha.unidade, linha.bloco)}:${linha.recibo}`) === 1) confirmadas.push(linha)
    else pendencias.push({ ...linha, motivo: 'Recibo de baixa vinculado a mais de uma parcela no Easy.' })
  }
  return { inicio, fim, linhas: confirmadas, pendencias, totalCentavos: confirmadas.reduce((soma, linha) => soma + linha.repasseCentavos, 0) }
}
