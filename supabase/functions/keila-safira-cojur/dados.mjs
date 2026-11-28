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

function detalharCota([recibo, data, principal, multa, correcaoJuros, total]) {
  if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !total) throw new Error('linha_cota_incompleta')
  return {
    recibo, vencimento: data.split('/').reverse().join('-'),
    principal_centavos: centavos(principal), multa_centavos: centavos(multa, true),
    correcao_juros_centavos: centavos(correcaoJuros, true), total_centavos: centavos(total),
  }
}

function lerCotaIndividual(linhas) {
  const campos = [
    ['Código', 'Código da Cota', 'Código Cota', 'Código da cota', 'Recibo', 'Nº Recibo', 'Nº do Recibo', 'Número do Recibo', 'Cota'],
    ['Vencimento', 'Data de Vencimento'],
    ['Valor Original'],
    ['Valor Multa', 'Valor da Multa'],
    ['Correção/Juros'],
    ['Valor Total'],
  ]
  const valores = campos.map(rotulos => {
    const encontradas = linhas.filter(([rotulo]) => rotulos.some(opcao => opcao.toLowerCase() === rotulo.toLowerCase()))
      .filter(linha => linha.length === 2)
    if (encontradas.length !== 1) throw new Error('campos_da_cota_individual_incompletos')
    return encontradas[0][1]
  })
  return detalharCota(valores)
}

export function lerBuscaCotasCojur(texto, unidade, { paginaCompletaSemRodape = false } = {}) {
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
    const colunas = cabecalho.map(titulo => linha.indexOf(titulo))
    if (colunas.some(coluna => coluna < 0)) continue
    const valores = linhas[i + 1] ?? []
    cotas.push(detalharCota(colunas.map(coluna => valores[coluna])))
  }
  if (cotas.length === 0 && paginaCompletaSemRodape && totais.length === 0) {
    cotas.push(lerCotaIndividual(linhas))
  }
  const soma = validarCotas(cotas)
  if (linhas.some(([titulo]) => /mais registros|resultado parcial|limite atingido|relat[oó]rio incompleto/i.test(titulo))) {
    throw new Error('relatorio_incompleto')
  }
  if (totais.length === 0 && paginaCompletaSemRodape) return cotas
  if (totais.length !== 1 || centavos(totais[0].at(-1)) !== soma) throw new Error('relatorio_incompleto')
  return cotas
}
