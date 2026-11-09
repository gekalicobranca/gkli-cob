function dataCivil(valor) {
  if (typeof valor !== 'string') return null
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : valor
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const parsed = new Date(iso + 'T12:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null
}

export function resultadosEasyPague(alvos, dados, portal, dataLimite) {
  const linhas = portal === 'lello'
    ? (dados.recebimentos ?? []).filter(doc => doc.tipo === 'recebimento').map(doc => ({
      acordo: doc.acordo_externo, numero: doc.numero, recibo: doc.recibo_consultado,
      vencimento: doc.vencimento, data: doc.data_pagamento, original: doc.valor_original_centavos,
      pago: doc.valor_pago_centavos, explicito: Boolean(doc.recibo_consultado) && doc.confirmado_na_fonte === true && doc.status === 'Contabilizado',
    }))
    : (dados.pagamentos ?? []).filter(doc => doc.natureza === 'parcela_acordo').map(doc => ({
      numero: doc.numero_parcela, recibo: doc.recibo, vencimento: doc.vencimento,
      data: doc.data_pagamento, original: doc.valor_original_centavos,
      pago: Math.round(doc.valor_pago * 100), explicito: doc.componentes_conferidos === true,
    }))

  return alvos.map(alvo => {
    const resultado = { parcela_id: alvo.parcela_id, estado: 'pendente' }
    const identificador = portal === 'lello' ? alvo.acordo_externo : alvo.recibo
    if (!identificador) return { ...resultado, detalhe: 'Parcela sem vínculo financeiro verificável.' }
    const candidatos = linhas.filter(linha => {
      const data = dataCivil(linha.data)
      if (!data || data > dataLimite) return false
      return portal === 'lello'
        ? linha.acordo === identificador && linha.numero === alvo.numero
        : linha.recibo === identificador
    })
    const compartilhado = alvos.some(outro => outro.parcela_id !== alvo.parcela_id && (
      portal === 'lello'
        ? outro.acordo_externo === identificador && outro.numero === alvo.numero
        : outro.recibo === identificador
    ))
    const linha = candidatos[0]
    const valor = Math.round(Number(alvo.valor) * 100)
    if (compartilhado || candidatos.length > 1) return { ...resultado, detalhe: 'Vínculo ou recebimento ambíguo.' }
    if (linha?.explicito && valor > 0 && linha.original === valor && linha.pago >= valor &&
      dataCivil(linha.vencimento) === alvo.vencimento && (linha.numero == null || linha.numero === alvo.numero)) {
      return { ...resultado, estado: 'confirmado', data_pagamento: dataCivil(linha.data), valor_pago: linha.pago / 100, recibo: linha.recibo }
    }
    return { ...resultado, detalhe: linha ? 'Recebimento exige conferência de valor, vencimento ou parcela.'
      : dados.status === 'consultado' ? 'Confirmação não localizada até a data limite.'
        : 'Consulta parcial ou acesso financeiro indisponível.' }
  })
}
