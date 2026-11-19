const normalizar = v => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()

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
