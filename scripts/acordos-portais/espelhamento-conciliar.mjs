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
  const [condominio, unidades, cotas, acordos] = await Promise.all([
    db.from('condominios').select('dias_apos_vencimento_regua,inicio_cobranca_dias,bloqueio_garantidora_habilitado,bloqueio_garantidora_inicio,bloqueio_garantidora_fim')
      .eq('id', condominioId).eq('carteira_id', carteiraId).eq('status', 'ativo').single(),
    listar('unidades', 'id,identificacao,bloco,acao_judicial'),
    listar('cobrancas', 'id,unidade_id,vencimento,valor_original,valor_atualizado,status_financeiro,status_operacional,data_pagamento,valor_pago,observacoes,automacao_bloqueada,updated_at',
      query => base(query).is('duplicada_de_id', null).is('duplicidade_arquivada_em', null).is('arquivada_em', null).not('excluida_por_cessao_espaco', 'is', true)),
    listar('acordos', 'id,unidade_id,cobranca_id,status,status_financeiro,data_acordo,data_quitacao,valor_acordado,origem_controle,updated_at,acordos_fontes_lello(codigo_condominio,numero_acordo,fonte_json),parcelas_acordo(id,numero,vencimento,valor,status,data_pagamento,valor_repasse_informado,updated_at),acordo_cobrancas(cobranca_id)'),
  ])
  if (condominio.error) throw Error('Cadastro do condomínio indisponível.')
  return { condominio: condominio.data, unidades, cotas, acordos }
}

export function planejarEspelhoLello(portal, app, codigo) {
  const pendencias = [], alteracoes = []
  const unidades = grupo(app.unidades, u => chaveUnidade(u.identificacao, u.bloco))
  const unidadesPorId = new Map(app.unidades.map(u => [u.id, u]))
  const cotasPorId = new Map(app.cotas.map(c => [c.id, c]))
  const cotasPorVencimento = grupo(app.cotas, c => `${c.unidade_id}:${c.vencimento}`)
  const acordosPorUnidade = grupo(app.acordos, a => a.unidade_id)
  const cotasVinculadas = new Set(app.acordos.filter(a => a.status !== 'cancelado').flatMap(a => [a.cobranca_id, ...a.acordo_cobrancas.map(c => c.cobranca_id)]).filter(Boolean))
  const historico = grupo(portal.pagamentos, r => `${chaveUnidade(r.unidade)}:${r.recibo}`)
  const recibosAtuais = new Set()
  const acordosEncontrados = new Set()
  const hoje = new Date(portal.consultadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
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
    const { cota, ambiguo } = localizarCota(lista[0].id, item, principal)
    if (ambiguo || (cota && (!emAberto(cota) || cota.data_pagamento || cotasVinculadas.has(cota.id)))) {
      pendente('cota', item, 'Cota no portal em aberto com situação ou vínculo conflitante no app.', total, cota?.status_financeiro)
      continue
    }
    const garantidora = app.condominio.bloqueio_garantidora_habilitado && item.vencimento >= app.condominio.bloqueio_garantidora_inicio
      && item.vencimento <= app.condominio.bloqueio_garantidora_fim
    const dias = (Date.parse(hoje) - Date.parse(item.vencimento)) / 86_400_000
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
        && (p.situacao === 'Contabilizado' ? p.pagamento : !p.pagamento)) && item.total === item.pago + item.saldo
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
      if (!local.valor_repasse_informado && acordo.origem_controle === 'carteira') pendente('repasse', { ...item, vencimento: p.vencimento }, `Parcela ${p.numero} paga. Repasse sem evidência no demonstrativo consultado.`, p.valor)
      if (local.status === 'paga' && local.data_pagamento === p.pagamento && centavos(local.valor) === p.valor) continue
      if (!exatos.length || ['cancelado', 'quebrado', 'renegociado', 'suspenso'].includes(acordo.status) || local.status === 'cancelada') {
        pendente('parcela', { ...item, vencimento: p.vencimento }, `Baixa da parcela ${p.numero} requer conferência do acordo no app.`, p.valor, local.status)
        continue
      }
      alteracoes.push({ tipo: 'parcela_paga', id: local.id, rev: local.updated_at, acordoId: acordo.id, acordoRev: acordo.updated_at,
        unidadeId: unidade.id, unidade: item.unidade, numero: item.numero, parcela: p.numero, vencimento: p.vencimento,
        dataPagamento: p.pagamento, valorPago: p.valor })
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

  return { consultadoEm: portal.consultadoEm, cotas: portal.cotas.length, acordos: portal.acordos.length,
    parcelasPagas: portal.acordos.reduce((s, a) => s + a.parcelas.filter(p => p.situacao === 'Contabilizado').length, 0),
    alteracoes: alteracoes.filter(a => !conflitantes.has(a)), pendencias }
}

export function confirmarRepassesLello(plano, portal, app, repassesSalvos, demonstrativo) {
  const hoje = new Date(portal.consultadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const salvos = new Map(repassesSalvos.map(r => [r.parcela_id, r]))
  const repasses = []
  const comprovantesAnexados = demonstrativo?.repasses ?? []
  const referenciasUsadas = new Set()
  for (const a of app.acordos.filter(a => a.origem_controle === 'carteira' && a.acordos_fontes_lello)) {
    const u = app.unidades.find(u => u.id === a.unidade_id)
    if (!u) continue
    const numero = a.acordos_fontes_lello.numero_acordo
    const chave = chaveUnidade(u.identificacao, u.bloco)
    for (const p of a.parcelas_acordo.filter(p => p.status === 'paga' && p.data_pagamento)) {
      const salvo = salvos.get(p.id)
      if (salvo) {
        comprovantesAnexados.filter(r => r.recibo === salvo.recibo && r.dataCredito === salvo.data_credito && r.centavos === salvo.valor_centavos)
          .forEach(r => referenciasUsadas.add(r.referencia))
        repasses.push({ unidade: u.identificacao, recibo: salvo.recibo, dataCredito: salvo.data_credito, valor: salvo.valor_centavos, estado: 'confirmado' })
        continue
      }
      const recebimentos = portal.pagamentos.filter(h => chaveUnidade(h.unidade) === chave && h.descricao === `Parcela ${p.numero} Acordo ${numero}`
        && h.pagamento === p.data_pagamento && h.vencimento === p.vencimento && h.valorPago === centavos(p.valor))
      if (recebimentos.length !== 1) continue
      const [linha] = recebimentos
      const provas = [...new Map([...portal.repasses.filter(r => r.unidade === linha.unidade),
        ...comprovantesAnexados.map(r => ({ ...r, unidade: linha.unidade, fonte: `arquivo:${demonstrativo.sha256}` }))]
        .filter(r => r.recibo === linha.recibo && r.dataCredito <= hoje && r.dataCredito >= p.data_pagamento)
        .map(r => [`${r.referencia}:${r.dataCredito}:${r.centavos}`, r])).values()]
      if (provas.length !== 1 || plano.alteracoes.some(r => r.id === p.id)) continue
      const [r] = provas
      referenciasUsadas.add(r.referencia)
      plano.alteracoes.push({ tipo: 'repasse_creditado', id: p.id, rev: p.updated_at, acordoId: a.id, unidadeId: u.id,
        numero, ...r, portal: 'lello' })
      repasses.push({ unidade: r.unidade, recibo: r.recibo, dataCredito: r.dataCredito, valor: r.centavos, estado: 'comprovado na fonte' })
      plano.pendencias = plano.pendencias.filter(q => q.tipo !== 'repasse' || q.referencia !== numero || q.vencimento !== p.vencimento || chaveUnidade(q.unidade) !== chave)
    }
  }
  for (const r of comprovantesAnexados) if (!referenciasUsadas.has(r.referencia)) plano.pendencias.push({ tipo: 'repasse', referencia: r.recibo,
    valor: r.centavos, motivo: 'Crédito do demonstrativo anexado sem parcela paga única na Lello e no app.' })
  return repasses
}
