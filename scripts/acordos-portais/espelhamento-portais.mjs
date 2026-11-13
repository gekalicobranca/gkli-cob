import { abrirManager } from '../scanner/manager.mjs'
import { abrirWebware } from '../scanner/webware.mjs'
import { resultadosEasyPague } from '../scanner/easy-pague-resultado.mjs'
import { conferirCreditoRegistrado, dataDoExtrato } from './espelhamento-repasses.mjs'

const reais = v => v == null ? null : Math.round(Number(v) * 100)
const normalizar = v => String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim()
const codigo = v => normalizar(v).replace(/^0+(?=\w)/, '')
const bloco = v => ['', '0', 'SEM BLOCO'].includes(codigo(v)) ? '' : codigo(v)
const recibo = v => String(v ?? '').match(/\brecibo\s*:?\s*(?:(?:AE|AJ|J|A|D|B|P)\s+)?(\d{5,})(?!\d)/i)?.[1] ?? null
const situacaoAberta = c => ['em_aberto', 'parcial', 'vencido'].includes(c.status_financeiro)
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

function escopo(u) {
  return { unidadeId: u.id, unidade: u.identificacao, unidadeLocal: u.identificacao, blocoLocal: u.bloco }
}

function agrupar(itens, chave) {
  const mapa = new Map()
  for (const item of itens) {
    const id = chave(item)
    const grupo = mapa.get(id) ?? []
    grupo.push(item)
    mapa.set(id, grupo)
  }
  return mapa
}

const identidadeUnidade = (unidade, setor) => `${bloco(setor)}|${codigo(unidade)}`

function unidadeDoRelatorio(unidades, item) {
  const lista = unidades.get(identidadeUnidade(item.unidade, item.bloco)) ?? []
  return lista.length === 1 ? lista[0] : null
}

export async function coletarExtratos(db, job, receitas, app, unidadesAlvo, signal, progresso) {
  const { data: configuracoes, error } = await db.from('scanner_configuracoes').select('id,portal,codigo_portal,perfil_acesso,unidades,receita_id')
    .eq('condominio_id', job.condominio_id).eq('ativo', true).eq('situacao', 'validado').in('receita_id', receitas.map(r => r.receita_id))
  if (error || configuracoes.length !== 1 || !['manager', 'bbz', 'sell'].includes(configuracoes[0].portal)) return new Map()
  const config = configuracoes[0]
  const { data: receita, error: erroReceita } = await db.from('agente_receitas').select('config_json').eq('id', config.receita_id).eq('ativo', true).eq('carteira_id', job.carteira_id).single()
  if (erroReceita || receita.config_json?.condominio_id !== job.condominio_id) return new Map()
  const ids = new Set(config.unidades)
  const unidades = app.unidades.filter(u => unidadesAlvo.has(u.id) && ids.has(u.id))
  const resposta = new Map()
  for (let i = 0; i < unidades.length; i += 12) {
    signal.throwIfAborted()
    const lote = unidades.slice(i, i + 12)
    const sessao = await (config.portal === 'manager' ? abrirManager : abrirWebware)({ ...config, dataLimite: hojeSP() }, receita.config_json, lote, signal).catch(() => null)
    if (!sessao) break
    try {
      for (const u of lote) {
        signal.throwIfAborted()
        if (sessao.podeIniciarUnidade?.() === false) break
        const r = await (sessao.coletarExtrato ?? sessao.coletar)(u.id).catch(() => null)
        if (r?.pagamentos?.unidade === u.id && r.pagamentos.codigo === config.codigo_portal) resposta.set(u.id, { ...r.pagamentos, portal: config.portal })
        if (r?.pagamentos?.diagnostico === 'sem_acesso') return resposta
        if (r?.pagamentos?.diagnostico === 'acesso_adiado') break
      }
    } finally { await sessao.close().catch(() => {}) }
    progresso(`Extratos: ${resposta.size}/${unidades.length}`)
  }
  signal.throwIfAborted()
  return resposta
}

export function planejarCotasPortais(cotas, app) {
  const pendencias = [], alteracoes = [], vistas = new Set(), duplicadas = new Set(), aguardandoExtrato = []
  const vinculadas = new Set(app.acordos.filter(a => a.status !== 'cancelado').flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]))
  const regua = Math.max(0, app.condominio.dias_apos_vencimento_regua ?? app.condominio.inicio_cobranca_dias ?? 30)
  const hoje = hojeSP()
  const unidades = agrupar(app.unidades, u => identidadeUnidade(u.identificacao, u.bloco))
  const unidadesPorId = new Map(app.unidades.map(u => [u.id, u]))
  const cotasPorVencimento = agrupar(app.cotas, c => `${c.unidade_id}|${c.vencimento}`)
  const qtd = new Map()
  for (const item of cotas) {
    const chave = `${bloco(item.bloco)}|${codigo(item.unidade)}|${item.recibo}`
    qtd.set(chave, (qtd.get(chave) ?? 0) + 1)
  }
  for (const item of cotas) {
    const u = unidadeDoRelatorio(unidades, item), vencimento = dataDoExtrato(item.vencimento)
    const chave = `${bloco(item.bloco)}|${codigo(item.unidade)}|${item.recibo}`
    const principal = reais(item.principal), total = reais(item.total)
    const candidatas = u ? cotasPorVencimento.get(`${u.id}|${vencimento}`) ?? [] : []
    const exatas = candidatas.filter(c => recibo(c.observacoes) === item.recibo)
    const legadas = candidatas.filter(c => !recibo(c.observacoes) && reais(c.valor_original) === principal)
    const possiveis = exatas.length ? exatas : legadas
    const local = possiveis[0]
    possiveis.forEach(c => vistas.add(c.id))
    if (qtd.get(chave) > 1) {
      if (!duplicadas.has(chave)) pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total, motivo: 'Recibo repetido nos arquivos da administradora.' })
      duplicadas.add(chave)
      continue
    }
    if (!u || !vencimento || !/^\d{5,}$/.test(item.recibo ?? '') || !(principal > 0) || !(total > 0) || item.componentes > 1
      || possiveis.length > 1 || (!local && candidatas.some(c => !recibo(c.observacoes)))
      || ['acordo', 'acordo_extrajudicial', 'acordo_judicial', 'deposito_identificado', 'boleto_bancario', 'protesto'].includes(item.situacao)
      || (local && (!situacaoAberta(local) || local.data_pagamento || vinculadas.has(local.id)))) {
      pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total,
        motivo: 'Recibo, composição, unidade ou situação exige conferência antes de aplicar.' })
      continue
    }
    const garantidora = app.condominio.bloqueio_garantidora_habilitado && vencimento >= app.condominio.bloqueio_garantidora_inicio && vencimento <= app.condominio.bloqueio_garantidora_fim
    const ativa = (Date.parse(hoje) - Date.parse(vencimento)) / 86_400_000 >= regua
    const estado = u.acao_judicial ? 'judicializado' : garantidora ? 'suspenso' : ativa ? 'em_cobranca_ativa' : 'regular'
    if (!local || !recibo(local.observacoes) || reais(local.valor_original) !== principal || Math.abs(reais(local.valor_atualizado) - total) > 100
      || (['novo', 'regular', 'em_cobranca_ativa'].includes(local.status_operacional) && local.status_operacional !== estado)) {
      alteracoes.push({ tipo: 'cota_aberta', ...escopo(u), recibo: item.recibo, id: local?.id, rev: local?.updated_at,
        vencimento, principal, total, multa: reais(item.multa) ?? 0, juros: reais(item.juros) ?? 0, correcao: reais(item.correcao) ?? 0, honorarios: reais(item.honorarios) })
    }
  }
  for (const c of app.cotas.filter(c => situacaoAberta(c) && !vistas.has(c.id))) {
    const u = unidadesPorId.get(c.unidade_id)
    if (u) aguardandoExtrato.push({ c, u, recibo: recibo(c.observacoes), vinculada: vinculadas.has(c.id) })
  }
  return { alteracoes, pendencias, aguardandoExtrato }
}

export function completarFinanceiro(plano, extratos, app, repassesSalvos, demonstrativo, administradora) {
  const hoje = hojeSP(), dataCorte = new Date(Date.parse(hoje) - 90 * 86_400_000).toISOString().slice(0, 10)
  const repasses = [], confirmados = new Set()
  for (const { c, u, recibo: numero, vinculada } of plano.aguardandoExtrato) {
    const extrato = extratos.get(u.id)
    const itens = (extrato?.pagamentos ?? []).filter(p => p.recibo === numero && dataDoExtrato(p.vencimento) === c.vencimento && p.natureza === 'cobranca'
      && p.componentes_conferidos && p.valor_original_centavos === reais(c.valor_original) && dataDoExtrato(p.data_pagamento) <= hoje && p.valor_pago > 0)
    if (numero && !vinculada && itens.length === 1 && !c.data_pagamento && !c.valor_pago) {
      plano.alteracoes.push({ tipo: 'cota_paga', ...escopo(u), id: c.id, rev: c.updated_at, recibo: numero, vencimento: c.vencimento,
        dataPagamento: dataDoExtrato(itens[0].data_pagamento), valorPago: reais(itens[0].valor_pago) })
    } else plano.pendencias.push({ tipo: 'cota', unidade: u.identificacao, referencia: numero, vencimento: c.vencimento, valor: reais(c.valor_original),
      motivo: 'Fora da posição de inadimplência, sem baixa direta inequívoca no extrato consultado.' })
  }

  const comprovantesAnexados = demonstrativo?.repasses ?? []
  const anexos = agrupar(comprovantesAnexados.map(r => ({ ...r, fonte: `arquivo:${demonstrativo.sha256}` })), r => r.recibo)
  const referenciasUsadas = new Set()
  const reciboParcela = p => p.recibo_financeiro ?? recibo(p.observacoes)
  const parcelasPorRecibo = agrupar(app.acordos.flatMap(a => a.parcelas_acordo), reciboParcela)
  const acordosPorUnidade = agrupar(app.acordos.filter(a => !['cancelado', 'renegociado'].includes(a.status)), a => a.unidade_id)
  const salvos = new Map(repassesSalvos.map(r => [r.parcela_id, r]))
  for (const u of app.unidades) {
    const extrato = extratos.get(u.id)
    const creditos = agrupar(extrato?.repasses_creditados ?? [], r => r.recibo)
    const alvos = (acordosPorUnidade.get(u.id) ?? [])
      .flatMap(a => a.parcelas_acordo.filter(p => p.status !== 'cancelada' && p.vencimento <= hoje).map(p => ({
        acordo: a, parcela: p, parcela_id: p.id, numero: p.numero, recibo: reciboParcela(p), vencimento: p.vencimento, valor: p.valor,
      })))
    const baixas = new Map((extrato ? resultadosEasyPague(alvos, extrato, extrato.portal, hoje) : []).map(p => [p.parcela_id, p]))
    for (const alvo of alvos) {
      const p = alvo.parcela, a = alvo.acordo, baixa = baixas.get(p.id)
      if (baixa?.estado === 'confirmado') {
        confirmados.add(p.id)
        if (p.status !== 'paga' && !p.data_pagamento && reais(p.valor) === reais(baixa.valor_pago)) {
          plano.alteracoes.push({ tipo: 'parcela_paga_extrato', ...escopo(u), id: p.id, rev: p.updated_at, acordoId: a.id,
            recibo: baixa.recibo, vencimento: p.vencimento, dataPagamento: baixa.data_pagamento, valorPago: reais(baixa.valor_pago) })
        } else if (p.data_pagamento !== baixa.data_pagamento || reais(p.valor) !== reais(baixa.valor_pago)) {
          plano.pendencias.push({ tipo: 'parcela', unidade: u.identificacao, referencia: baixa.recibo, vencimento: p.vencimento, motivo: 'Recebimento difere da data ou do valor lançado. Requer revisão.' })
        }
      } else if (!p.data_pagamento && p.vencimento < hoje && !['quitado', 'quebrado'].includes(a.status)) {
        plano.pendencias.push({ tipo: 'parcela', unidade: u.identificacao, referencia: alvo.recibo, vencimento: p.vencimento,
          motivo: baixa?.detalhe ?? 'Extrato do período indisponível ou unidade sem acesso financeiro validado.' })
      }
      if (a.origem_controle !== 'carteira' || (p.status !== 'paga' && baixa?.estado !== 'confirmado')) continue
      const pagamento = p.data_pagamento ?? baixa?.data_pagamento
      const salvo = salvos.get(p.id)
      const reciboCredito = salvo?.recibo ?? alvo.recibo
      const provas = [...(creditos.get(reciboCredito) ?? []).map(r => ({ ...r, fonte: extrato.fonte })), ...(anexos.get(reciboCredito) ?? [])]
      if (salvo) {
        const estado = conferirCreditoRegistrado({ salvo, provas, unidade: u.identificacao, vencimento: p.vencimento, pendencias: plano.pendencias, referenciasUsadas })
        repasses.push({ unidade: u.identificacao, recibo: salvo.recibo, dataCredito: salvo.data_credito, valor: salvo.valor_centavos, estado })
        continue
      }
      const evidencias = [...new Map(provas.filter(r => r.dataCredito <= hoje && r.dataCredito >= pagamento)
        .map(r => [`${r.referencia}:${r.dataCredito}:${r.centavos}`, r])).values()]
      if (evidencias.length === 1 && parcelasPorRecibo.get(alvo.recibo)?.length === 1 && p.status === 'paga' && p.data_pagamento) {
        const r = evidencias[0]
        referenciasUsadas.add(r.referencia)
        plano.alteracoes.push({ tipo: 'repasse_creditado', ...escopo(u), id: p.id, rev: p.updated_at, acordoId: a.id,
          ...r, portal: extrato?.portal ?? administradora })
        repasses.push({ unidade: u.identificacao, recibo: r.recibo, dataCredito: r.dataCredito, valor: r.centavos, estado: 'comprovado na fonte' })
      } else if (pagamento >= dataCorte) {
        plano.pendencias.push({ tipo: 'repasse', unidade: u.identificacao, referencia: alvo.recibo, vencimento: p.vencimento,
          valor: reais(p.valor_repasse_informado), motivo: p.valor_repasse_informado ? 'Repasse informado no app, aguardando comprovante de crédito.' : 'Valor de repasse e crédito sem comprovante na fonte consultada.' })
      }
    }
  }
  for (const r of comprovantesAnexados) if (!referenciasUsadas.has(r.referencia)) plano.pendencias.push({ tipo: 'repasse', referencia: r.recibo,
    valor: r.centavos, motivo: 'Crédito do demonstrativo anexado sem parcela paga única no app.' })
  return { repasses, parcelasPagas: confirmados.size }
}

export function conferirDemonstrativo(acordosPortal, app, pendencias) {
  if (!acordosPortal) {
    pendencias.push({ tipo: 'acordo', motivo: 'Demonstrativo de acordos com identidade e composição não disponível neste acesso.' })
    return null
  }
  const unidades = agrupar(app.unidades, u => identidadeUnidade(u.identificacao, u.bloco))
  const acordos = agrupar(app.acordos, a => a.unidade_id)
  for (const a of acordosPortal) {
    const u = unidadeDoRelatorio(unidades, a)
    const candidatos = (u ? acordos.get(u.id) ?? [] : []).filter(x => Math.abs(reais(x.valor_acordado) - a.total.valor_centavos) <= 100
      && x.parcelas_acordo.length === a.parcelas.length && a.parcelas.every(p => x.parcelas_acordo.some(q =>
        dataDoExtrato(p.vencimento) === q.vencimento && Math.abs(p.valor_centavos - reais(q.valor)) <= 100)))
    if (candidatos.length !== 1) pendencias.push({ tipo: 'acordo', unidade: a.unidade, referencia: a.processo, valor: a.total.valor_centavos,
      motivo: 'Acordo do demonstrativo sem correspondência única por unidade, valor e grade.' })
  }
  return acordosPortal.length
}
