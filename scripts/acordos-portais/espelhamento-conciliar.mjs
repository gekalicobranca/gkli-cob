import { planejarPreJuridico } from './espelhamento-pre-juridico.mjs'
import { planejarBorderoLello } from './espelhamento-bordero.mjs'
import { planejarContatosEFlows } from './espelhamento-contatos-flows.mjs'
import { conferirCreditoRegistrado } from './espelhamento-repasses.mjs'

function grupo(items, key) {
  const map = new Map()
  for (const item of items) {
    const id = key(item)
    const lista = map.get(id) ?? []
    lista.push(item)
    map.set(id, lista)
  }
  return map
}

const emAberto = c => ['em_aberto', 'vencido', 'parcial'].includes(c.status_financeiro)
const centavos = v => Math.round(Number(v) * 100)
const normalizar = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase()

function chaveUnidade(identificacao, bloco) {
  const unidade = normalizar(identificacao).replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\w)/, '')
  const setor = normalizar(bloco).replace(/[^A-Z0-9]/g, '')
  return /^\d+$/.test(unidade) && /^[A-Z]$/.test(setor) ? unidade + setor : unidade
}

const numeroRecibo = s => String(s ?? '').match(/\brecibo\s*:?\s*(?:(?:LELLO|AE|AJ|J|A|D|B|P)\s+)?(\d{6,})(?!\d)/i)?.[1] ?? null

export async function lerEspelhoApp(db, condominioId, carteiraId) {
  const base = query => query.eq('condominio_id', condominioId).eq('carteira_id', carteiraId)
  async function listar(tabela, colunas, limitar = base) {
    const registros = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await limitar(db.from(tabela).select(colunas)).order('id').range(offset, offset + 499)
      if (error) throw Error(`Não foi possível consultar ${tabela} no app.`)
      registros.push(...data)
      if (data.length < 500) return registros
    }
  }
  const [condominio, unidades, cotas, acordos, reguas] = await Promise.all([
    db.from('condominios').select('nome,vencimento_cota_dia,dias_apos_vencimento_regua,inicio_cobranca_dias,dias_cobranca_ativa,pre_juridico_habilitado,pre_juridico_minimo_cotas,carteiras:carteira_id(pre_juridico_habilitado),bloqueio_garantidora_habilitado,bloqueio_garantidora_inicio,bloqueio_garantidora_fim')
      .eq('id', condominioId).eq('carteira_id', carteiraId).eq('status', 'ativo').single(),
    listar('unidades', 'id,identificacao,bloco,acao_judicial,numero_processo,conducao_processo,responsavel_nome,responsavel_documento,email,telefone,updated_at'),
    listar('cobrancas', 'id,unidade_id,competencia,vencimento,valor_original,valor_atualizado,status_financeiro,status_operacional,data_pagamento,valor_pago,observacoes,automacao_bloqueada,updated_at',
      query => base(query).is('duplicada_de_id', null).is('duplicidade_arquivada_em', null).is('arquivada_em', null).not('excluida_por_cessao_espaco', 'is', true)),
    listar('acordos', 'id,unidade_id,cobranca_id,tipo,numero_processo,status,status_financeiro,data_acordo,data_quitacao,valor_acordado,despesa_cobranca_valor,origem_controle,updated_at,acordos_fontes_lello(codigo_condominio,numero_acordo),parcelas_acordo(id,numero,vencimento,valor,status,data_pagamento,valor_repasse_informado,updated_at),acordo_cobrancas(cobranca_id)'),
    listar('reguas', 'id,ativo,status,etapas:regua_etapas(canal,ativo)', query => query.eq('carteira_id', carteiraId).eq('tipo', 'cobranca')),
  ])
  if (condominio.error) throw Error('Cadastro do condomínio indisponível.')
  return { condominio: condominio.data, unidades, cotas, acordos, reguas }
}

export async function lerPeriodosBordero(db, dataBase) {
  const { data, error } = await db.rpc('easy_espelhamento_periodos_bordero', { p_data_base: dataBase })
  if (error) throw Error('Não foi possível consultar os períodos do fechamento.')
  return data
}

export function planejarEspelhoLello(portal, app, codigo) {
  const pendencias = [], alteracoes = []
  const unidades = grupo(app.unidades, u => chaveUnidade(u.identificacao, u.bloco))
  const unidadesPorId = new Map(app.unidades.map(u => [u.id, u]))
  const cotasPorId = new Map(app.cotas.map(c => [c.id, c]))
  const cotasPorVencimento = grupo(app.cotas, c => `${c.unidade_id}:${c.vencimento}`)
  const cotasPorRecibo = grupo(app.cotas, c => `${c.unidade_id}:${numeroRecibo(c.observacoes)}`)
  const acordosPorUnidade = grupo(app.acordos, a => a.unidade_id)
  const cotasVinculadas = new Set(app.acordos.filter(a => a.status !== 'cancelado').flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]).filter(Boolean))
  const vinculosImpedemPre = new Set(app.acordos.filter(a => !['cancelado', 'renegociado'].includes(a.status)).flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]).filter(Boolean))
  const recibosEmAcordoNaLello = new Set(portal.acordos.filter(a => normalizar(a.situacao) !== 'CANCELADO')
    .flatMap(a => a.cotas.map(c => `${chaveUnidade(a.unidade)}:${c.recibo}`)))
  const unidadesComAcordoJudicial = new Set(app.acordos.filter(a => a.tipo === 'judicial').map(a => a.unidade_id))
  const basePreJuridico = []
  const homologacoes = []
  const revisoesJudiciais = []
  const historico = grupo(portal.pagamentos, r => `${chaveUnidade(r.unidade)}:${r.recibo}`)
  const pagamentosPorAcordo = grupo(portal.pagamentos, r => `${chaveUnidade(r.unidade)}:${r.descricao}`)
  const recibosAtuais = new Set()
  const acordosEncontrados = new Set()
  const hoje = new Date(portal.consultadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const cotasPortalPorUnidade = grupo(portal.cotas, c => chaveUnidade(c.unidade))
  for (const acordo of app.acordos.filter(a => a.tipo === 'judicial' && a.data_acordo && !['cancelado', 'renegociado', 'quitado'].includes(a.status))) {
    const unidade = unidadesPorId.get(acordo.unidade_id)
    if (!unidade) continue
    const recibosVinculados = new Set([acordo.cobranca_id, ...acordo.acordo_cobrancas.map(v => v.cobranca_id)]
      .map(id => numeroRecibo(cotasPorId.get(id)?.observacoes)).filter(Boolean))
    const candidatas = (cotasPortalPorUnidade.get(chaveUnidade(unidade.identificacao, unidade.bloco)) ?? [])
      .filter(c => c.vencimento > acordo.data_acordo && c.vencimento < hoje && !recibosVinculados.has(c.recibo))
    if (candidatas.length) revisoesJudiciais.push({ acordoId: acordo.id, unidade: unidade.identificacao, processo: acordo.numero_processo ?? unidade.numero_processo,
      cotas: candidatas.map(c => ({ recibo: c.recibo, vencimento: c.vencimento, saldoCentavos: c.valores.at(-1) })) })
  }
  const regua = Math.max(0, app.condominio.dias_apos_vencimento_regua ?? app.condominio.inicio_cobranca_dias ?? 30)
  const pendente = (tipo, item, motivo, valor, app) => pendencias.push({ tipo, unidade: item.unidade, referencia: item.recibo ?? item.numero, vencimento: item.vencimento, motivo, valor, app })

  function localizarCota(unidadeId, item, principal) {
    const candidatas = cotasPorVencimento.get(`${unidadeId}:${item.vencimento}`) ?? []
    const exatas = candidatas.filter(c => numeroRecibo(c.observacoes) === item.recibo)
    const legadas = candidatas.filter(c => !numeroRecibo(c.observacoes) && centavos(c.valor_original) === principal)
    const possiveis = exatas.length ? exatas : legadas
    return { cota: possiveis.length === 1 ? possiveis[0] : null, ambiguo: possiveis.length > 1 || (!possiveis.length && candidatas.some(c => !numeroRecibo(c.observacoes))) }
  }

  for (const item of portal.cotas) {
    const [principal, multa, juros, correcao] = item.valores
    const total = item.valores.at(-1)
    const key = `${chaveUnidade(item.unidade)}:${item.recibo}`
    if (recibosAtuais.has(key)) throw Error('Relatório de cotas contém recibo duplicado.')
    recibosAtuais.add(key)
    const lista = unidades.get(chaveUnidade(item.unidade)) ?? []
    if (lista.length !== 1) {
      pendente('cota', item, 'Unidade ausente ou ambígua no app.', total)
      continue
    }
    const mesmoRecibo = item.recibo ? cotasPorRecibo.get(`${lista[0].id}:${item.recibo}`) ?? [] : []
    if (mesmoRecibo.some(c => c.vencimento !== item.vencimento)) {
      pendente('cota', item, 'O recibo já existe na unidade com outro vencimento. Confira as datas antes de aplicar.', total)
      continue
    }
    const { cota, ambiguo } = localizarCota(lista[0].id, item, principal)
    const garantidora = app.condominio.bloqueio_garantidora_habilitado && item.vencimento >= app.condominio.bloqueio_garantidora_inicio
      && item.vencimento <= app.condominio.bloqueio_garantidora_fim
    const dias = (Date.parse(hoje) - Date.parse(item.vencimento)) / 86_400_000
    const unidade = lista[0]
    const baixaNaFonte = (historico.get(key) ?? []).some(r => r.pagamento && r.valorPago > 0 && r.vencimento === item.vencimento)
    if (!ambiguo && cota) {
      basePreJuridico.push({
        item, unidade, cota, diasAtraso: dias, baixaNaFonte,
        vinculoExato: numeroRecibo(cota.observacoes) === item.recibo,
        impedida: garantidora || baixaNaFonte || vinculosImpedemPre.has(cota.id) || recibosEmAcordoNaLello.has(key)
          || unidade.acao_judicial || unidade.numero_processo?.trim() || unidadesComAcordoJudicial.has(unidade.id)
          || ['nosso_escritorio', 'outro_advogado'].includes(unidade.conducao_processo),
      })
    }
    if (ambiguo || baixaNaFonte || recibosEmAcordoNaLello.has(key) || (cota && (!emAberto(cota) || cota.data_pagamento || cotasVinculadas.has(cota.id)))) {
      pendente('cota', item, 'Cota no portal em aberto com situação ou vínculo conflitante no app.', total, cota?.status_financeiro)
      continue
    }
    const status = lista[0].acao_judicial ? 'judicializado' : garantidora ? 'suspenso' : dias >= regua ? 'em_cobranca_ativa' : 'regular'
    const reclassificar = cota && cota.status_operacional !== status && ['regular', 'novo', 'em_cobranca_ativa'].includes(cota.status_operacional)
    if (!cota || centavos(cota.valor_original) !== principal || Math.abs(centavos(cota.valor_atualizado) - total) > 100 || !numeroRecibo(cota.observacoes) || reclassificar) {
      alteracoes.push({ tipo: 'cota_aberta', unidadeId: lista[0].id, id: cota?.id, rev: cota?.updated_at,
        unidade: item.unidade, recibo: item.recibo, vencimento: item.vencimento, principal, multa, juros, correcao,
        honorarios: item.valores.length > 5 ? item.valores[4] : null, total })
    }
  }

  for (const cota of app.cotas.filter(emAberto)) {
    const unidade = unidadesPorId.get(cota.unidade_id)
    const recibo = numeroRecibo(cota.observacoes)
    const item = { unidade: unidade?.identificacao, recibo, vencimento: cota.vencimento }
    if (alteracoes.some(a => a.tipo === 'cota_aberta' && a.id === cota.id)) continue
    if (!unidade || !recibo) {
      pendente('cota', item, 'Cota fora do relatório sem recibo confirmado no app.', centavos(cota.valor_original), cota.status_financeiro)
      continue
    }
    const key = `${chaveUnidade(unidade.identificacao, unidade.bloco)}:${recibo}`
    if (recibosAtuais.has(key)) continue
    const rows = (historico.get(key) ?? []).filter(r => r.vencimento === cota.vencimento)
    const baixas = rows.filter(r => /^BAIXA AUTOMATICA\b/.test(normalizar(r.situacao)) && r.pagamento && r.valorPago > 0 && r.principal === centavos(cota.valor_original))
    if (baixas.length === 1 && !cotasVinculadas.has(cota.id) && !cota.data_pagamento && !cota.valor_pago) {
      const baixa = baixas[0]
      alteracoes.push({ tipo: 'cota_paga', id: cota.id, rev: cota.updated_at, unidadeId: cota.unidade_id,
        ...item, dataPagamento: baixa.pagamento, valorPago: baixa.valorPago })
      continue
    }
    pendente('cota', item, rows.length ? `Fora dos atrasos. Histórico da Lello: ${[...new Set(rows.map(r => r.situacao))].join(', ')}.` : 'Fora dos atrasos sem baixa localizada.', centavos(cota.valor_original), cota.status_financeiro)
  }

  for (const item of portal.acordos) {
    const situacao = normalizar(item.situacao)
    const baixasDaParcela = p => (pagamentosPorAcordo.get(`${chaveUnidade(item.unidade)}:Parcela ${p.numero} Acordo ${item.numero}`) ?? [])
      .filter(r => r.recibo && r.vencimento === p.vencimento && r.pagamento === p.pagamento && r.valorPago === p.valor)
    const lista = unidades.get(chaveUnidade(item.unidade)) ?? []
    if (lista.length !== 1) {
      if (situacao !== 'CANCELADO') pendente('acordo', item, 'Unidade ausente ou ambígua no app.', item.total)
      continue
    }
    const unidade = lista[0]
    const locais = acordosPorUnidade.get(unidade.id) ?? []
    const exatos = locais.filter(a => a.acordos_fontes_lello?.codigo_condominio === codigo && a.acordos_fontes_lello?.numero_acordo === item.numero)
    const possiveis = exatos.length ? exatos : locais.filter(a => !a.acordos_fontes_lello && a.data_acordo === item.data
      && centavos(a.valor_acordado) === item.total && a.parcelas_acordo.length === item.parcelas.length
      && a.parcelas_acordo.every(p => item.parcelas.some(r => r.numero === p.numero && r.vencimento === p.vencimento && centavos(p.valor) === r.valor)))
    if (possiveis.length !== 1) {
      const composicao = item.cotas.map(c => ({ ...c, ...localizarCota(unidade.id, c, c.principal) }))
      const compValida = composicao.length > 0 && composicao.every(c => c.cota && !c.ambiguo && !cotasVinculadas.has(c.cota.id)
        && numeroRecibo(c.cota.observacoes) === c.recibo && /^BAIXADO POR ACORDO/.test(normalizar(c.situacao)))
      const gradeValida = item.parcelas.length > 0 && item.parcelas.every(p => p.valor > 0 && ['Pendente', 'Contabilizado'].includes(p.situacao)
        && (p.situacao === 'Contabilizado' ? p.pagamento && baixasDaParcela(p).length === 1 : !p.pagamento))
        && item.total === item.pago + item.saldo
      if (!possiveis.length && !locais.some(a => a.data_acordo === item.data || Math.abs(centavos(a.valor_acordado) - item.total) <= 100)
        && ['QUITADO', 'EM ANDAMENTO'].includes(situacao) && ['Amigável', 'Pré-Jurídico'].includes(item.tipo) && item.data && compValida && gradeValida) {
        alteracoes.push({ tipo: 'acordo_novo', unidadeId: unidade.id, unidade: item.unidade, numero: item.numero,
          total: item.total, data: item.data, situacao: item.situacao, pago: item.pago, saldo: item.saldo, tipoPortal: item.tipo,
          parcelas: item.parcelas, composicao: composicao.map(c => ({ id: c.cota.id, rev: c.cota.updated_at, recibo: c.recibo, principal: c.principal, vencimento: c.vencimento })) })
        continue
      }
      if (situacao !== 'CANCELADO' || possiveis.length) pendente('acordo', item, possiveis.length ? 'Mais de um acordo compatível.' : 'Acordo sem correspondência única no app.', item.total)
      continue
    }
    const acordo = possiveis[0]
    acordosEncontrados.add(acordo.id)
    const parcelas = acordo.parcelas_acordo
    const gradeValida = item.parcelas.length > 0 && item.parcelas.every(p => p.valor > 0)
      && item.parcelas.reduce((s, p) => s + p.valor, 0) === item.total
      && item.parcelas.filter(p => p.situacao === 'Contabilizado').every(p => p.pagamento)
      && item.parcelas.filter(p => p.situacao === 'Contabilizado').reduce((s, p) => s + p.valor, 0) === item.pago
    if (!gradeValida || parcelas.length !== item.parcelas.length || Math.abs(centavos(acordo.valor_acordado) - item.total) > 100) {
      pendente('acordo', item, 'Total ou grade de parcelas divergente.', item.total, acordo.status)
      continue
    }
    const composicao = item.cotas.map(c => ({ ...c, ...localizarCota(unidade.id, c, c.principal) }))
    const vinculadas = new Set([acordo.cobranca_id, ...acordo.acordo_cobrancas.map(c => c.cobranca_id)].filter(Boolean))
    const novosVinculos = composicao.filter(c => c.cota && !vinculadas.has(c.cota.id))
    const origemExata = composicao.length > 0 && composicao.every(c => c.cota && !c.ambiguo && vinculadas.has(c.cota.id)
      && numeroRecibo(c.cota.observacoes) === c.recibo) && composicao.length === vinculadas.size
    const gradeExata = parcelas.every(p => item.parcelas.some(r => r.numero === p.numero && r.vencimento === p.vencimento && r.valor === centavos(p.valor)))
    if (exatos.length === 1 && ['QUITADO', 'EM ANDAMENTO'].includes(situacao)) {
      homologacoes.push({ acordoId: acordo.id, unidade: item.unidade, numero: item.numero,
        composicaoConferida: origemExata, condicoesConferidas: gradeExata && item.data === acordo.data_acordo && item.total === centavos(acordo.valor_acordado),
        documento: `https://portal.lellocondominios.com.br/relatorios/Acordo.do?${new URLSearchParams({ codCondo: codigo, codUnidade: item.unidade, codAcordo: item.numero })}` })
    }
    if (composicao.some(c => !c.cota || c.ambiguo) || [...vinculadas].some(id => !composicao.some(c => c.cota?.id === id))) {
      if (situacao !== 'CANCELADO') pendente('vínculo', item, 'Composição por recibo difere do cadastro ou contém cota ainda sem vínculo confirmado.', item.total, acordo.status)
    } else if (situacao !== 'CANCELADO' && novosVinculos.length) {
      for (const c of novosVinculos) {
        if (!exatos.length || cotasVinculadas.has(c.cota.id) || numeroRecibo(c.cota.observacoes) !== c.recibo || !/^BAIXADO POR ACORDO/.test(normalizar(c.situacao))) {
          pendente('vínculo', { ...c, unidade: item.unidade }, 'Recibo já vinculado ou sem baixa por este acordo.', c.principal)
        } else {
          alteracoes.push({ tipo: 'vinculo', id: acordo.id, rev: acordo.updated_at, unidadeId: unidade.id, cotaId: c.cota.id, cotaRev: c.cota.updated_at,
            unidade: item.unidade, recibo: c.recibo, numero: item.numero, vencimento: c.vencimento, principal: c.principal })
        }
      }
    }
    if (situacao === 'CANCELADO' && acordo.status !== 'cancelado') {
      if (exatos.length && item.pago === 0 && !vinculadas.size && parcelas.every(p => !p.data_pagamento && p.status !== 'paga')) {
        alteracoes.push({ tipo: 'acordo_cancelado', id: acordo.id, rev: acordo.updated_at, unidadeId: unidade.id, unidade: item.unidade, numero: item.numero })
      } else pendente('acordo', item, 'Acordo cancelado na Lello. Confira substituição e destinação das cotas.', item.total, acordo.status)
    }
    if (situacao === 'QUITADO' && acordo.status !== 'quitado' && parcelas.every(p => p.status === 'paga')) {
      pendente('acordo', item, 'Quitação da Lello difere do status do acordo no app.', item.total, acordo.status)
    }
    if (!['QUITADO', 'EM ANDAMENTO', 'CANCELADO'].includes(situacao)
      || (situacao === 'EM ANDAMENTO' && !['ativo', 'em_dia', 'em_atraso', 'vencido'].includes(acordo.status))) {
      pendente('acordo', item, `Situação da Lello: ${item.situacao}. Confira o encerramento ou a renegociação.`, item.total, acordo.status)
    }
    if (!exatos.length) pendente('acordo', item, 'Acordo compatível por grade, mas a identificação da fonte ainda requer vínculo.', item.total, acordo.status)
    for (const p of item.parcelas) {
      const local = parcelas.find(l => l.numero === p.numero)
      if (!local || local.vencimento !== p.vencimento || Math.abs(centavos(local.valor) - p.valor) > 100) {
        pendente('parcela', { ...item, vencimento: p.vencimento }, `Parcela ${p.numero} com vencimento ou valor divergente.`, p.valor, local?.status)
        continue
      }
      if (p.situacao !== 'Contabilizado') {
        if (local.data_pagamento) pendente('parcela', { ...item, vencimento: p.vencimento }, `Pagamento no app sem baixa correspondente na Lello na parcela ${p.numero}.`, p.valor, local.status)
        continue
      }
      const recebimentos = baixasDaParcela(p)
      if (recebimentos.length !== 1) {
        pendente('parcela', { ...item, vencimento: p.vencimento }, `Parcela ${p.numero} sem recibo de baixa inequívoco no histórico.`, p.valor, local.status)
        continue
      }
      if (!local.valor_repasse_informado && acordo.origem_controle === 'carteira') pendente('repasse', { ...item, vencimento: p.vencimento }, `Parcela ${p.numero} paga. Repasse sem evidência no demonstrativo consultado.`, p.valor)
      if (local.status === 'paga' && local.data_pagamento === p.pagamento && centavos(local.valor) === p.valor) continue
      if (!exatos.length || ['cancelado', 'quebrado', 'renegociado', 'suspenso'].includes(acordo.status) || local.status === 'cancelada') {
        pendente('parcela', { ...item, vencimento: p.vencimento }, `Baixa da parcela ${p.numero} requer conferência do acordo no app.`, p.valor, local.status)
        continue
      }
      alteracoes.push({ tipo: 'parcela_paga', id: local.id, rev: local.updated_at, acordoId: acordo.id, acordoRev: acordo.updated_at,
        unidadeId: unidade.id, unidade: item.unidade, numero: item.numero, parcela: p.numero, vencimento: p.vencimento,
        dataPagamento: p.pagamento, valorPago: p.valor, recibo: recebimentos[0].recibo })
    }
  }

  for (const acordo of app.acordos) {
    if (acordosEncontrados.has(acordo.id) || acordo.status === 'cancelado') continue
    const unidade = unidadesPorId.get(acordo.unidade_id)
    const fonte = acordo.acordos_fontes_lello
    const vinculo = cotasPorId.get(acordo.cobranca_id)
    pendente('acordo', { unidade: unidade?.identificacao, numero: fonte?.numero_acordo, vencimento: vinculo?.vencimento },
      'Acordo do app sem correspondência confirmada na Lello.', centavos(acordo.valor_acordado), acordo.status)
  }

  const alteracoesPorCota = grupo(alteracoes.flatMap(a => a.tipo === 'acordo_novo' ? a.composicao.map(c => ({ cota: c.id, alteracao: a }))
    : a.tipo === 'vinculo' ? [{ cota: a.cotaId, alteracao: a }]
      : ['cota_paga', 'cota_aberta'].includes(a.tipo) && a.id ? [{ cota: a.id, alteracao: a }] : []), a => a.cota)
  const conflitantes = new Set([...alteracoesPorCota.values()].filter(lista => lista.length > 1).flatMap(lista => lista.map(a => a.alteracao)))
  for (const a of conflitantes) pendente(a.tipo, a, 'Mais de uma alteração disputando o mesmo recibo nesta consulta.', a.total ?? a.valorPago)

  const [periodo, anterior] = app.periodosBordero ?? []
  const bordero = periodo => periodo && ({ ...planejarBorderoLello({ portal, app, codigo, ...periodo, chaveUnidade }),
    periodoId: periodo.id, status: periodo.status })
  if (!periodo) pendencias.push({ tipo: 'borderô', motivo: 'Nenhum período de fechamento configurado para a data da conferência.' })
  const preJuridico = planejarPreJuridico({ dataBase: hoje, condominio: app.condominio, cotas: basePreJuridico, acordos: app.acordos })
  const canais = ['email', 'whatsapp'].filter(canal => (app.reguas ?? []).some(regua => {
    const etapas = regua.etapas.filter(e => e.ativo !== false)
    return regua.ativo && regua.status !== 'inativa' && etapas.length && etapas.every(e => e.canal === canal)
  }))
  return { consultadoEm: portal.consultadoEm, cotas: portal.cotas.length, acordos: portal.acordos.length,
    parcelasPagas: portal.acordos.reduce((s, a) => s + a.parcelas.filter(p => p.situacao === 'Contabilizado').length, 0),
    preJuridico: { ...preJuridico, revisoesJudiciais },
    homologacoes,
    contatosEFlows: planejarContatosEFlows({ fichas: portal.contatos ?? [], cotas: basePreJuridico, chaveUnidade, canais, prazoDias: regua, preJuridico }),
    bordero: bordero(periodo) ?? null,
    borderoAnterior: bordero(anterior) ?? null,
    alteracoes: alteracoes.filter(a => !conflitantes.has(a)), pendencias }
}

export function confirmarRepassesLello(plano, portal, app, repassesSalvos, demonstrativo) {
  const hoje = new Date(portal.consultadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const salvos = new Map(repassesSalvos.map(r => [r.parcela_id, r]))
  const repasses = []
  const comprovantesAnexados = demonstrativo?.repasses ?? []
  const unidades = new Map(app.unidades.map(u => [u.id, u]))
  const pagamentos = grupo(portal.pagamentos, h => `${chaveUnidade(h.unidade)}:${h.descricao}`)
  const repassesPortal = grupo(portal.repasses ?? [], r => `${chaveUnidade(r.unidade)}:${r.recibo}`)
  const anexos = grupo(comprovantesAnexados.map(r => ({ ...r, fonte: `arquivo:${demonstrativo.sha256}` })), r => r.recibo)
  const baixasPorRecibo = grupo(portal.pagamentos, h => h.recibo)
  const parcelasAlteradas = new Set(plano.alteracoes.map(r => r.id))
  const pendenciasResolvidas = new Set()
  const referenciasUsadas = new Set()
  for (const a of app.acordos.filter(a => a.origem_controle === 'carteira' && a.acordos_fontes_lello)) {
    const u = unidades.get(a.unidade_id)
    if (!u) continue
    const numero = a.acordos_fontes_lello.numero_acordo
    const chave = chaveUnidade(u.identificacao, u.bloco)
    for (const p of a.parcelas_acordo.filter(p => p.status === 'paga' && p.data_pagamento)) {
      const salvo = salvos.get(p.id)
      const recebimentos = (pagamentos.get(`${chave}:Parcela ${p.numero} Acordo ${numero}`) ?? []).filter(h =>
        h.pagamento === p.data_pagamento && h.vencimento === p.vencimento && h.valorPago === centavos(p.valor))
      const recibo = salvo?.recibo ?? (recebimentos.length === 1 ? recebimentos[0].recibo : null)
      if (!recibo) continue
      const provas = [...(repassesPortal.get(`${chave}:${recibo}`) ?? []), ...(anexos.get(recibo) ?? [])]
      if (salvo) {
        const novoRecibo = recebimentos.length === 1 && recebimentos[0].recibo !== salvo.recibo ? recebimentos[0].recibo : null
        const provasNovoRecibo = novoRecibo ? repassesPortal.get(`${chave}:${novoRecibo}`) ?? [] : []
        const estado = conferirCreditoRegistrado({ salvo, provas: [...provas, ...provasNovoRecibo], unidade: u.identificacao, vencimento: p.vencimento, pendencias: plano.pendencias, referenciasUsadas })
        repasses.push({ parcelaId: p.id, unidade: u.identificacao, recibo: salvo.recibo, dataCredito: salvo.data_credito, valor: salvo.valor_centavos, estado })
        continue
      }
      const [linha] = recebimentos
      const validas = [...new Map(provas.filter(r => r.dataCredito <= hoje && r.dataCredito >= p.data_pagamento
        && (!r.fonte?.startsWith('arquivo:') || baixasPorRecibo.get(recibo)?.length === 1))
        .map(r => [`${r.referencia}:${r.dataCredito}:${r.centavos}`, r])).values()]
      if (validas.length !== 1 || parcelasAlteradas.has(p.id)) continue
      const [r] = validas
      referenciasUsadas.add(r.referencia)
      plano.alteracoes.push({ tipo: 'repasse_creditado', id: p.id, rev: p.updated_at, acordoId: a.id, unidadeId: u.id,
        numero, ...r, unidade: linha.unidade, portal: 'lello' })
      repasses.push({ parcelaId: p.id, unidade: linha.unidade, recibo: r.recibo, dataCredito: r.dataCredito, valor: r.centavos, estado: 'comprovado na fonte' })
      pendenciasResolvidas.add(`${chave}:${numero}:${p.vencimento}`)
    }
  }
  if (pendenciasResolvidas.size) plano.pendencias = plano.pendencias.filter(q =>
    q.tipo !== 'repasse' || !pendenciasResolvidas.has(`${chaveUnidade(q.unidade)}:${q.referencia}:${q.vencimento}`))
  for (const r of comprovantesAnexados) if (!referenciasUsadas.has(r.referencia)) plano.pendencias.push({ tipo: 'repasse', referencia: r.recibo,
    valor: r.centavos, motivo: 'Crédito do demonstrativo anexado sem parcela paga única na Lello e no app.' })
  return repasses
}
