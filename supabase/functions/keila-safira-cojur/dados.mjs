export const referenciaSafira = '63004'

export function dataBrasilia(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function centavos(texto, vazio = false) {
  if (vazio && texto === '') return 0
  if (!/^\d+(?:\.\d{3})*,\d{2}$/.test(texto)) throw new Error('valor_invalido')
  return Number(texto.replace(/[.,]/g, ''))
}

export function validarCotas(cotas) {
  if (!Array.isArray(cotas) || cotas.length < 1 || cotas.length > 200) throw new Error('quantidade_invalida')
  const recibos = new Set()
  for (const cota of cotas) {
    if (!cota || typeof cota !== 'object') throw new Error('cota_invalida')
    const { recibo, vencimento, principal_centavos, multa_centavos, correcao_juros_centavos, total_centavos } = cota
    if (typeof recibo !== 'string' || !/^\d{6,15}$/.test(recibo) || recibos.has(recibo)) throw new Error('recibo_invalido')
    recibos.add(recibo)
    const data = new Date(`${vencimento}T00:00:00Z`)
    if (typeof vencimento !== 'string' || !Number.isFinite(data.getTime()) ||
        data.toISOString().slice(0, 10) !== vencimento) throw new Error('vencimento_invalido')
    const valores = [principal_centavos, multa_centavos, correcao_juros_centavos, total_centavos]
    if (valores.some(v => !Number.isSafeInteger(v) || v < 0 || v > 100_000_000) ||
        total_centavos <= 0 ||
        principal_centavos + multa_centavos + correcao_juros_centavos !== total_centavos) throw new Error('total_invalido')
  }
  return cotas.reduce((total, cota) => total + cota.total_centavos, 0)
}

export function lerBuscaCotasCojur(texto, unidade) {
  const linhas = texto.split(/\r?\n/).map(linha => linha.split('\t').map(celula => celula.trim()))
  const referencias = new Set(linhas.filter(([h]) => h === 'Referência').map(([, valor]) => valor?.match(/^\d+/)?.[0]))
  const unidades = new Set(linhas.filter(([h]) => h === 'Unidade').map(([, valor]) => valor?.match(/^\d+/)?.[0]))
  if (referencias.size !== 1 || !referencias.has(referenciaSafira) ||
      unidades.size !== 1 || !unidades.has(unidade)) throw new Error('escopo_do_relatorio_invalido')

  const cabecalho = ['Código', 'Vencimento', 'Valor Original', 'Valor Multa', 'Correção/Juros', 'Total']
  const cotas = []
  const totais = []
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    if (linha[0] === 'Total de Débitos') totais.push(linha)
    if (!cabecalho.every((titulo, coluna) => linha[coluna] === titulo)) continue
    const [recibo, data, principal, multa, correcaoJuros, total] = linhas[i + 1] ?? []
    if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !total) throw new Error('linha_cota_incompleta')
    cotas.push({
      recibo, vencimento: data.split('/').reverse().join('-'),
      principal_centavos: centavos(principal), multa_centavos: centavos(multa, true),
      correcao_juros_centavos: centavos(correcaoJuros, true), total_centavos: centavos(total),
    })
  }
  if (totais.length !== 1 || centavos(totais[0].at(-1)) !== validarCotas(cotas)) throw new Error('relatorio_incompleto')
  return cotas
}
