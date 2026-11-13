const normalizar = v => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

export function conferirCreditoRegistrado({ salvo, provas, unidade, vencimento, pendencias, referenciasUsadas }) {
  const divergencias = new Map()
  for (const prova of provas) {
    if (prova.fonte?.startsWith('arquivo:')) referenciasUsadas.add(prova.referencia)
    if (prova.recibo !== salvo.recibo || prova.dataCredito !== salvo.data_credito || prova.centavos !== Number(salvo.valor_centavos)) {
      divergencias.set(`${prova.recibo}:${prova.dataCredito}:${prova.centavos}`, prova)
    }
  }
  for (const prova of divergencias.values()) {
    pendencias.push({ tipo: 'repasse', unidade, referencia: salvo.recibo, vencimento, valor: prova.centavos,
      valorSalvo: Number(salvo.valor_centavos), motivo: `Crédito divergente na fonte, recibo ${prova.recibo} de ${prova.dataCredito.split('-').reverse().join('/')}. O registro de ${salvo.data_credito.split('-').reverse().join('/')} foi preservado para revisão.` })
  }
  return divergencias.size ? 'divergente' : 'confirmado'
}

export function dataDoExtrato(v) {
  const s = String(v ?? '').trim()
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s.split('/').reverse().join('-') : s
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T12:00:00Z`)
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === iso ? iso : null
}

export function lerRepassesCreditados(tabelas) {
  const repasses = []
  for (const tabela of tabelas) {
    const cabecalho = tabela[0]?.map(normalizar) ?? []
    const data = cabecalho.findIndex(c => /^(data (do |de )?credito (do )?repasse|data (do )?repasse creditado)$/.test(c))
    const valor = cabecalho.findIndex(c => /^(valor (do )?repasse creditado|valor creditado (do )?repasse)$/.test(c))
    const recibo = cabecalho.findIndex(c => /^(recibo|numero (do )?recibo)$/.test(c))
    const id = cabecalho.findIndex(c => /^(id (do )?repasse|referencia (do )?repasse|identificador (do )?credito)$/.test(c))
    if ([data, valor, recibo, id].includes(-1)) continue
    for (const row of tabela.slice(1)) {
      const credito = dataDoExtrato(row[data]), referencia = String(row[id] ?? '').trim(), chave = String(row[recibo] ?? '').trim()
      const quantia = String(row[valor] ?? '').replace(/R\$|\s/g, '')
      if (!credito || !/^\d{5,}$/.test(chave) || !/^[A-Za-z0-9./_-]{3,100}$/.test(referencia)
        || !/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(quantia)) continue
      const centavos = Number(quantia.replace(/[.,]/g, ''))
      if (Number.isSafeInteger(centavos) && centavos > 0) repasses.push({ recibo: chave, referencia, dataCredito: credito, centavos })
    }
  }
  return repasses
}
