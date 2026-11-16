import { planejarContatosEFlows } from './espelhamento-contatos-flows.mjs'
import { planejarPreJuridico } from './espelhamento-pre-juridico.mjs'
import { apurarRepasse } from './espelhamento-bordero.mjs'
import { dataDoExtrato } from './espelhamento-repasses.mjs'

const indisponivel = new Set(['cancelado', 'renegociado', 'quebrado'])
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase().replace(/^0+(?=\w)/, '')
const chaveUnidade = (unidade, bloco) => `${['0', 'SEM BLOCO'].includes(normalizar(bloco)) ? '' : normalizar(bloco)}|${normalizar(unidade)}`
const reciboLocal = valor => String(valor ?? '').match(/\brecibo\s*:?\s*(?:(?:AE|AJ|J|A|D|B|P)\s+)?(\d{5,})(?!\d)/i)?.[1]
const centavos = valor => Math.round(Number(valor) * 100)
const dataSP = instante => new Date(instante).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

function indexar(linhas, chave) {
  const mapa = new Map()
  for (const linha of linhas) {
    const id = chave(linha)
    const grupo = mapa.get(id) ?? []
    grupo.push(linha)
    mapa.set(id, grupo)
  }
  return mapa
}

export function basePreviaManager(cotas, app, dataBase, extratos = new Map()) {
  const unidades = indexar(app.unidades, u => chaveUnidade(u.identificacao, u.bloco))
  const locais = indexar(app.cotas, c => `${c.unidade_id}|${reciboLocal(c.observacoes)}`)
  const recibos = indexar(cotas, c => `${chaveUnidade(c.unidade, c.bloco)}|${String(c.recibo ?? '').match(/\d{5,}$/)?.[0]}`)
  const vigentes = app.acordos.filter(a => !['cancelado', 'renegociado'].includes(a.status))
  const bloqueadas = new Set(vigentes.flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]))
  const judiciais = new Set(app.acordos.filter(a => a.tipo === 'judicial').map(a => a.unidade_id))
  const saida = []
  for (const item of cotas) {
    const chave = chaveUnidade(item.unidade, item.bloco)
    const grupo = unidades.get(chave) ?? []
    const vencimento = dataDoExtrato(item.vencimento)
    if (grupo.length !== 1 || !vencimento || !/^\d{5,}$/.test(item.recibo ?? '') || item.componentes !== 1
      || !(centavos(item.principal) > 0) || !(centavos(item.total) > 0)
      || ['acordo', 'acordo_extrajudicial', 'acordo_judicial', 'judicial', 'judicializado', 'deposito_identificado', 'boleto_bancario', 'protesto'].includes(item.situacao)
      || recibos.get(`${chave}|${item.recibo}`)?.length !== 1) continue
    const [unidade] = grupo
    const candidatas = locais.get(`${unidade.id}|${item.recibo}`) ?? []
    if (candidatas.length !== 1) continue
    const [cota] = candidatas
    if (cota.vencimento !== vencimento || centavos(cota.valor_original) !== centavos(item.principal)) continue
    const garantia = app.condominio.bloqueio_garantidora_habilitado
      && vencimento >= app.condominio.bloqueio_garantidora_inicio && vencimento <= app.condominio.bloqueio_garantidora_fim
    const baixaNaFonte = (extratos.get(unidade.id)?.pagamentos ?? []).some(p => {
      const data = dataDoExtrato(p.data_pagamento)
      return p.recibo === item.recibo && p.valor_pago > 0 && dataDoExtrato(p.vencimento) === vencimento && data && data <= dataBase
    })
    saida.push({ item: { ...item, unidade: unidade.identificacao, vencimento, valores: [centavos(item.total)] },
      unidade, cota, vinculoExato: true, diasAtraso: (Date.parse(dataBase) - Date.parse(vencimento)) / 86_400_000,
      baixaNaFonte, impedida: Boolean(garantia || baixaNaFonte || bloqueadas.has(cota.id) || unidade.acao_judicial
        || unidade.numero_processo?.trim() || judiciais.has(unidade.id) || ['nosso_escritorio', 'outro_advogado'].includes(unidade.conducao_processo)) })
  }
  return saida
}

export function alvosContatoManager(base, app) {
  const inicio = app.condominio.dias_apos_vencimento_regua ?? app.condominio.inicio_cobranca_dias ?? 30
  return new Set(base.filter(r => !r.impedida && r.diasAtraso >= Math.max(1, inicio) && !r.cota.data_pagamento
    && !r.cota.automacao_bloqueada && ['novo', 'em_cobranca_ativa'].includes(r.cota.status_operacional)
    && ['em_aberto', 'vencido', 'parcial'].includes(r.cota.status_financeiro)
    && centavos(r.cota.valor_atualizado) === r.item.valores.at(-1)).map(r => r.unidade.id))
}

function planejarBorderoManager(app, periodo, confirmados, repasses, acordosPortal) {
  const { inicio, fim } = periodo
  const noPeriodo = data => data && data >= inicio && data <= fim
  const unidades = new Map(app.unidades.map(u => [u.id, u]))
  const creditos = new Map(repasses.map(r => [r.parcelaId, r]))
  const recibos = indexar(app.acordos.flatMap(a => a.parcelas_acordo.filter(p => p.status !== 'cancelada')), p => p.recibo_financeiro)
  const linhas = [], pendencias = []
  const acordosPorUnidade = indexar(acordosPortal ?? [], a => chaveUnidade(a.unidade, a.bloco))
  for (const a of app.acordos) {
    if (a.tipo === 'judicial' || a.origem_controle !== 'carteira' || indisponivel.has(a.status)) continue
    const u = unidades.get(a.unidade_id)
    if (!u) continue
    const grade = a.parcelas_acordo.filter(p => p.status !== 'cancelada')
    const correspondentes = (acordosPorUnidade.get(chaveUnidade(u.identificacao, u.bloco)) ?? [])
      .filter(r => r.total?.valor_centavos === centavos(a.valor_acordado) && r.parcelas.length === grade.length
        && grade.every(p => r.parcelas.some(q => Number(String(q.parcela).split('/')[0]) === p.numero
          && dataDoExtrato(q.vencimento) === p.vencimento && q.valor_centavos === centavos(p.valor))))
    const numero = correspondentes.length === 1 ? correspondentes[0].processo : null
    for (const p of grade) {
      const baixa = confirmados.get(p.id)
      if (!noPeriodo(p.data_pagamento) && !noPeriodo(baixa?.data_pagamento)) continue
      const campo = { acordoId: a.id, parcelaId: p.id, numero, unidade: u.identificacao, bloco: u.bloco,
        parcela: p.numero, quantidadeParcelas: grade.length, vencimento: p.vencimento }
      if (!noPeriodo(baixa?.data_pagamento) || !baixa.recibo || baixa.recibo !== p.recibo_financeiro
        || recibos.get(baixa.recibo)?.length !== 1 || centavos(baixa.valor_pago) !== centavos(p.valor)
        || (p.data_pagamento && p.data_pagamento !== baixa.data_pagamento)) {
        pendencias.push({ ...campo, motivo: 'Baixa sem confirmação inequívoca no extrato da Manager ou divergente no Easy.' })
        continue
      }
      const repasse = apurarRepasse(a, p)
      if (!repasse) {
        pendencias.push({ ...campo, motivo: 'Pagamento confirmado. Repasse sem valor documentado ou rateio verificável.' })
        continue
      }
      const unidade = u.bloco && !/^0+$/.test(u.bloco) ? `${u.identificacao}, bloco ${u.bloco}` : u.identificacao
      const credito = creditos.get(p.id)
      linhas.push({ ...campo, recibo: baixa.recibo, dataBaixa: baixa.data_pagamento, valorPagoCentavos: centavos(baixa.valor_pago),
        repasseCentavos: repasse.valor, origemRepasse: repasse.origem,
        credito: credito ? { estado: credito.estado, data: credito.dataCredito, valorCentavos: credito.valor } : undefined,
        descricao: `Serviços de cobrança extrajudicial — ${app.condominio.nome}, acordo ${numero ?? 'Easy ' + a.id}, unidade ${unidade}, parcela ${p.numero}/${grade.length}, baixa de ${baixa.data_pagamento.split('-').reverse().join('/')}, repasse de ${moeda.format(repasse.valor / 100)}.` })
    }
  }
  return { inicio, fim, periodoId: periodo.id, status: periodo.status, linhas, pendencias, totalCentavos: linhas.reduce((total, r) => total + r.repasseCentavos, 0) }
}

export function planejarPreviasManager({ app, base, cadastros, confirmados, repasses, acordosPortal, dataBase }) {
  const preJuridico = planejarPreJuridico({ dataBase, condominio: app.condominio, cotas: base, acordos: app.acordos })
  const basePorUnidade = indexar(base, r => r.unidade.id)
  preJuridico.revisoesJudiciais = app.acordos.flatMap(a => {
    if (a.tipo !== 'judicial' || !a.data_acordo || ['quitado', 'cancelado', 'renegociado'].includes(a.status)) return []
    const vinculadas = new Set([a.cobranca_id, ...a.acordo_cobrancas.map(v => v.cobranca_id)])
    const candidatas = (basePorUnidade.get(a.unidade_id) ?? []).filter(r => r.diasAtraso > 0 && !r.baixaNaFonte
      && !r.cota.data_pagamento && ['em_aberto', 'vencido', 'parcial'].includes(r.cota.status_financeiro)
      && r.item.vencimento > a.data_acordo && !vinculadas.has(r.cota.id))
    if (!candidatas.length) return []
    const [{ unidade }] = candidatas
    return [{ acordoId: a.id, unidade: unidade.identificacao, processo: a.numero_processo ?? unidade.numero_processo,
      cotas: candidatas.map(r => ({ recibo: r.item.recibo, vencimento: r.item.vencimento, saldoCentavos: r.item.valores.at(-1) })) }]
  })
  const alvos = alvosContatoManager(base, app)
  const cotas = base.filter(r => alvos.has(r.unidade.id))
    .map(r => ({ ...r, impedida: r.impedida || centavos(r.cota.valor_atualizado) !== r.item.valores.at(-1) }))
  const fichas = []
  for (const u of new Map(cotas.map(r => [r.unidade.id, r.unidade])).values()) {
    const cadastro = cadastros.get(u.id)
    if (cadastro?.unidade !== u.id || !cadastro.consultadoEm || dataSP(cadastro.consultadoEm) !== dataBase
      || cadastro.fichas?.length !== 1 || cadastro.fichas[0].Unidade !== u.id) continue
    const ficha = cadastro.fichas[0]
    fichas.push({ unidade: u.identificacao, bloco: u.bloco, nome: ficha.Nome, email: ficha.Email,
      telefones: [ficha.Celular].filter(Boolean), consultadoEm: cadastro.consultadoEm })
  }
  const canais = ['email', 'whatsapp'].filter(canal => app.reguas.some(regua => {
    const ativas = regua.etapas.filter(e => e.ativo !== false)
    return regua.ativo && regua.status !== 'inativa' && ativas.length && ativas.every(e => e.canal === canal)
  }))
  const [periodo, anterior] = app.periodosBordero ?? []
  const bordero = ciclo => ciclo ? planejarBorderoManager(app, ciclo, confirmados, repasses, acordosPortal) : null
  return { preJuridico, contatosEFlows: planejarContatosEFlows({ fichas, cotas, chaveUnidade, canais,
    prazoDias: app.condominio.dias_apos_vencimento_regua ?? app.condominio.inicio_cobranca_dias ?? 30, preJuridico, administradora: 'Manager' }),
    bordero: bordero(periodo), borderoAnterior: bordero(anterior) }
}
