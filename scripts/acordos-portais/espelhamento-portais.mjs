import { abrirManager } from '../scanner/manager.mjs'
import { abrirWebware } from '../scanner/webware.mjs'
import { resultadosEasyPague } from '../scanner/easy-pague-resultado.mjs'
import { dataDoExtrato } from './espelhamento-repasses.mjs'

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

export async function coletarExtratos(db, job, receitas, app, unidadesAlvo, signal, progresso, limitePreviaMs = 0, somenteCadastro = false) {
  const { data: configuracoes, error } = await db.from('scanner_configuracoes').select('id,portal,codigo_portal,perfil_acesso,unidades,receita_id')
    .eq('condominio_id', job.condominio_id).eq('ativo', true).eq('situacao', 'validado').in('receita_id', receitas.map(r => r.receita_id))
  if (error || configuracoes.length !== 1 || !['manager', 'bbz', 'sell'].includes(configuracoes[0].portal)) return new Map()
  const config = configuracoes[0]
  const { data: receita, error: erroReceita } = await db.from('agente_receitas').select('config_json').eq('id', config.receita_id).eq('ativo', true).eq('carteira_id', job.carteira_id).single()
  if (erroReceita || receita.config_json?.condominio_id !== job.condominio_id) return new Map()
  const ids = new Set(config.unidades)
  const unidades = app.unidades.filter(u => unidadesAlvo.has(u.id) && ids.has(u.id))
  progresso(`Unidades habilitadas para extrato: ${unidades.length}`)
  const resposta = new Map()
  const limite = (!job.aplicar || somenteCadastro) && limitePreviaMs > 0 ? AbortSignal.timeout(limitePreviaMs) : null
  const sinalColeta = limite ? AbortSignal.any([signal, limite]) : signal
  for (let i = 0; i < unidades.length; i += 12) {
    signal.throwIfAborted()
    if (limite?.aborted) break
    const lote = unidades.slice(i, i + 12)
    const sessao = await (config.portal === 'manager' ? abrirManager : abrirWebware)({ ...config, dataLimite: hojeSP(), financeiroSuspenso: somenteCadastro }, receita.config_json, lote, sinalColeta).catch(() => null)
    if (!sessao) break
    try {
      for (const u of lote) {
        signal.throwIfAborted()
        if (limite?.aborted) break
        if (sessao.podeIniciarUnidade?.() === false) break
        if (somenteCadastro) {
          const cadastro = await sessao.coletarCadastro(u.id).catch(() => null)
          if (cadastro?.unidade === u.id && cadastro.codigo === config.codigo_portal && cadastro.fichas?.length === 1) {
            resposta.set(u.id, { ...cadastro, consultadoEm: new Date().toISOString() })
          }
          continue
        }
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

export function planejarCotasPortais(relatorio, app) {
  const cotas = relatorio.map(item => {
    const marcado = item.origemSistema === 'Winker' ? String(item.recibo ?? '').match(/^(\d{5,})\s+([AJ])$/i) : null
    return marcado ? { ...item, recibo: marcado[1], marcadorWinker: marcado[2].toUpperCase() } : item
  })
  const pendencias = [], alteracoes = [], vistas = new Set(), duplicadas = new Set(), aguardandoExtrato = []
  const vinculadas = new Set(app.acordos.filter(a => a.status !== 'cancelado').flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]))
  const regua = Math.max(0, app.condominio.dias_apos_vencimento_regua ?? app.condominio.inicio_cobranca_dias ?? 30)
  const hoje = hojeSP()
  const unidades = agrupar(app.unidades, u => identidadeUnidade(u.identificacao, u.bloco))
  const unidadesPorId = new Map(app.unidades.map(u => [u.id, u]))
  const cotasPorVencimento = agrupar(app.cotas, c => `${c.unidade_id}|${c.vencimento}`)
  const cotasPorRecibo = agrupar(app.cotas, c => `${c.unidade_id}|${recibo(c.observacoes)}`)
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
    const mesmoRecibo = u && item.recibo ? cotasPorRecibo.get(`${u.id}|${item.recibo}`) ?? [] : []
    mesmoRecibo.forEach(c => vistas.add(c.id))
    if (qtd.get(chave) > 1) {
      if (!duplicadas.has(chave)) pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total, motivo: 'Recibo repetido nos arquivos da administradora.' })
      duplicadas.add(chave)
      continue
    }
    if (vencimento && mesmoRecibo.some(c => c.vencimento !== vencimento)) {
      pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total,
        motivo: 'O recibo já existe na unidade com outro vencimento. Confira as datas antes de aplicar.' })
      continue
    }
    if (!u) {
      pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total,
        motivo: 'Unidade e bloco sem correspondência única no cadastro.' })
      continue
    }
    if (item.marcadorWinker === 'A') {
      if (exatas.length !== 1 || !vinculadas.has(local.id)) {
        pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total,
          motivo: 'A Verti indica acordo. Confira o vínculo da cota com o acordo.' })
      }
      continue
    }
    if (item.marcadorWinker === 'J' && !u.acao_judicial && local?.status_operacional !== 'judicializado') {
      pendencias.push({ tipo: 'cota', unidade: item.unidade, referencia: item.recibo, vencimento, valor: total,
        motivo: 'A Verti indica situação judicial. Confira a situação da cota no cadastro.' })
      continue
    }
    if (!vencimento || !/^\d{5,}$/.test(item.recibo ?? '') || !(principal > 0) || !(total > 0) || item.componentes > 1
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

export function completarFinanceiro(plano, extratos, app, hoje = hojeSP()) {
  const confirmados = new Map()
  for (const { c, u, recibo: numero, vinculada } of plano.aguardandoExtrato) {
    const extrato = extratos.get(u.id)
    const itens = (extrato?.pagamentos ?? []).filter(p => p.recibo === numero && dataDoExtrato(p.vencimento) === c.vencimento && p.natureza === 'cobranca'
      && p.componentes_conferidos && p.valor_original_centavos === reais(c.valor_original) && dataDoExtrato(p.data_pagamento) && dataDoExtrato(p.data_pagamento) <= hoje && p.valor_pago > 0)
    if (numero && !vinculada && itens.length === 1 && !c.data_pagamento && !c.valor_pago) {
      plano.alteracoes.push({ tipo: 'cota_paga', ...escopo(u), id: c.id, rev: c.updated_at, recibo: numero, vencimento: c.vencimento,
        dataPagamento: dataDoExtrato(itens[0].data_pagamento), valorPago: reais(itens[0].valor_pago) })
      const diferenca = reais(c.valor_atualizado) - reais(itens[0].valor_pago)
      if (extrato.portal === 'oma' && diferenca > 0) {
        const motivo = diferenca === reais(c.juros)
          ? 'Juros do GKLI não constam no recebimento informado pela OMA.'
          : 'Recebimento da OMA inferior ao valor atualizado no GKLI.'
        plano.pendencias.push({ tipo: 'cota', unidade: u.identificacao, referencia: numero, vencimento: c.vencimento,
          valor: diferenca, motivo })
      }
    } else plano.pendencias.push({ tipo: 'cota', unidade: u.identificacao, referencia: numero, vencimento: c.vencimento, valor: reais(c.valor_original),
      motivo: 'Fora da posição de inadimplência, sem baixa direta inequívoca no extrato consultado.' })
  }

  const reciboParcela = p => p.recibo_financeiro ?? recibo(p.observacoes)
  const acordosPorUnidade = agrupar(app.acordos.filter(a => !['cancelado', 'renegociado'].includes(a.status)), a => a.unidade_id)
  for (const u of app.unidades) {
    const extrato = extratos.get(u.id)
    const alvos = (acordosPorUnidade.get(u.id) ?? [])
      .flatMap(a => a.parcelas_acordo.filter(p => p.status !== 'cancelada' && p.vencimento <= hoje).map(p => ({
        acordo: a, parcela: p, parcela_id: p.id, numero: p.numero, recibo: reciboParcela(p), vencimento: p.vencimento, valor: p.valor,
      })))
    const baixas = new Map((extrato ? resultadosEasyPague(alvos, extrato, extrato.portal, hoje) : []).map(p => [p.parcela_id, p]))
    for (const alvo of alvos) {
      const p = alvo.parcela, a = alvo.acordo, baixa = baixas.get(p.id)
      if (baixa?.estado === 'confirmado') {
        confirmados.set(p.id, baixa)
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
    }
  }
  return { parcelasPagas: confirmados.size, confirmados }
}

export function conferirDemonstrativo(acordosPortal, app, pendencias, correspondencias = new Map()) {
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
    if (candidatos.length === 1) {
      const [local] = candidatos
      const linhas = correspondencias.get(local.id) ?? []
      linhas.push(a)
      correspondencias.set(local.id, linhas)
    }
    if (candidatos.length !== 1) pendencias.push({ tipo: 'acordo', unidade: a.unidade, referencia: a.processo, valor: a.total.valor_centavos,
      motivo: 'Acordo do demonstrativo sem correspondência única por unidade, valor e grade.' })
  }
  return acordosPortal.length
}
