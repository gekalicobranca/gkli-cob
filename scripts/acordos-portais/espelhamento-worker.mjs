import { createClient } from '@supabase/supabase-js'
import { coletarEspelhoLello, FalhaTemporariaLello } from './espelhamento-lello.mjs'
import { confirmarRepassesLello, lerEspelhoApp, lerPeriodosBordero, planejarEspelhoLello } from './espelhamento-conciliar.mjs'
import fontesDoEspelhamento from './espelhamento-fontes.ts'
import { coletarExtratos, completarFinanceiro, conferirDemonstrativo, planejarCotasPortais } from './espelhamento-portais.mjs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { captarCotasEspelhamento, coletarAcordosManager, coletarAcordosWebware } = fontesDoEspelhamento

async function configurar(pedido) {
  const [receitas, cadastro] = await Promise.all([
    db.from('agente_receitas').select('config_json,administradora:agente_administradoras!inner(ativo)')
      .eq('script_key', 'captacao_lello').eq('ativo', true).eq('administradora.ativo', true)
      .eq('carteira_id', pedido.carteira_id).eq('config_json->>condominio_id', pedido.condominio_id),
    db.from('agente_acordos_configuracoes').select('alvos_portal').eq('condominio_id', pedido.condominio_id)
      .eq('carteira_id', pedido.carteira_id).eq('administradora', 'Lello').eq('habilitado', true).maybeSingle(),
  ])
  if (receitas.error || cadastro.error || !cadastro.data) throw Error('Configuração do agente da Lello indisponível.')
  const codigos = [...new Set(receitas.data.map(r => r.config_json?.codigo_portal).filter(Boolean).map(String))]
  const alvos = cadastro.data.alvos_portal.filter(alvo => codigos.includes(alvo.codigo))
  if (codigos.length !== 1 || alvos.length !== 1) throw Error('O condomínio não tem um alvo único para o espelhamento.')
  const alvo = alvos[0]
  const perfil = alvo.credencial ? `_${alvo.credencial}` : ''
  const usuario = process.env[`LELLO_ACORDOS${perfil}_USUARIO`] || process.env[`AGENTE_LELLO${perfil}_USUARIO`]
  const senha = process.env[`LELLO_ACORDOS${perfil}_SENHA`] || process.env[`AGENTE_LELLO${perfil}_SENHA`]
  if (!usuario || !senha) throw Error('Credenciais do perfil da Lello não configuradas no agente.')
  return { codigo: alvo.codigo, nome: alvo.nome, usuario, senha }
}

async function processar(pedido) {
  let etapa = 'configuração'
  let config
  try {
    const inicio = Date.now()
    const progresso = mensagem => console.log(`Espelhamento ${pedido.id}: ${mensagem}`)
    const medir = async (nome, executar) => {
      const comeco = Date.now()
      try { return await executar() }
      finally { progresso(`${nome}: ${Date.now() - comeco} ms`) }
    }
    const signal = AbortSignal.timeout(17 * 60_000)
    const salvos = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('easy_espelhamento_repasses').select('parcela_id,recibo,data_credito,valor_centavos')
        .eq('condominio_id', pedido.condominio_id).eq('carteira_id', pedido.carteira_id).order('parcela_id').range(offset, offset + 499)
      if (error) throw Error('Não foi possível consultar os repasses já confirmados.')
      salvos.push(...data)
      if (data.length < 500) break
    }
    let plano, codigo
    if (!pedido.administradora || pedido.administradora === 'Lello') {
      config = await configurar(pedido)
      codigo = config.codigo
      etapa = 'consulta dos relatórios da Lello'
      const salvas = new Map()
      if (!pedido.aplicar && pedido.tentativas > 1) {
        const { data: etapas, error: erroEtapas } = await db.from('easy_espelhamento_etapas').select('etapa,dados')
          .eq('espelhamento_id', pedido.id).gte('coletado_em', new Date(Date.now() - 25 * 60_000).toISOString())
        if (erroEtapas) throw Error('Não foi possível consultar as etapas da coleta.')
        for (const etapa of etapas) salvas.set(etapa.etapa, etapa.dados)
      }
      const portal = await medir('Coleta Lello', () => coletarEspelhoLello(config, signal, progresso, pedido.aplicar ? undefined : {
        salvas,
        salvar: async (nome, dados) => {
          const { error } = await db.rpc('easy_espelhamento_salvar_etapa', { p_id: pedido.id, p_tentativa: pedido.tentativas, p_etapa: nome, p_dados: dados })
          if (error) throw Error('Não foi possível guardar a etapa da coleta.')
        },
      }))
      etapa = 'conciliação com o GKLI Cob'
      const dataBase = new Date(portal.consultadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      const [app, periodos] = await Promise.all([
        lerEspelhoApp(db, pedido.condominio_id, pedido.carteira_id),
        lerPeriodosBordero(db, dataBase),
      ])
      app.periodosBordero = periodos
      plano = planejarEspelhoLello(portal, app, codigo)
      plano.repasses = confirmarRepassesLello(plano, portal, app, salvos, pedido.demonstrativo_repasses)
      const creditos = new Map(plano.repasses.map(r => [r.parcelaId, r]))
      for (const bordero of [plano.bordero, plano.borderoAnterior]) {
        for (const linha of bordero?.linhas ?? []) {
          const credito = creditos.get(linha.parcelaId)
          if (credito) linha.credito = { estado: credito.estado, data: credito.dataCredito, valorCentavos: credito.valor }
        }
      }
    } else {
      const { data: fontes, error } = await db.rpc('easy_espelhamento_receitas', { p_carteiras: [pedido.carteira_id] })
      if (error) throw Error('Não foi possível validar os agentes do condomínio.')
      const receitas = fontes.filter(r => r.condominio_id === pedido.condominio_id && r.administradora === pedido.administradora)
      if (!receitas.length || new Set(receitas.map(r => r.script_key)).size !== 1) throw Error('Agente ativo ausente ou ambíguo neste condomínio.')
      etapa = 'coleta da inadimplência'
      const [receita] = receitas
      codigo = `receita:${receita.receita_id}`
      const cap = await medir('Coleta de cotas', () => captarCotasEspelhamento(db, pedido, receitas, signal))
      progresso(`Cotas consultadas: ${cap.cotas.length}`)
      etapa = 'conciliação com o GKLI Cob'
      const app = await lerEspelhoApp(db, pedido.condominio_id, pedido.carteira_id)
      const base = planejarCotasPortais(cap.cotas, app)
      const porParcela = new Map()
      for (let offset = 0; ; offset += 500) {
        const { data: recibos, error } = await db.rpc('easy_espelhamento_recibos', { p_condominio: pedido.condominio_id, p_carteira: pedido.carteira_id })
          .order('id').range(offset, offset + 499)
        if (error) throw Error('Não foi possível validar os recibos de parcelas do app.')
        for (const r of recibos) porParcela.set(r.id, r.recibo)
        if (recibos.length < 500) break
      }
      const alvos = new Set(base.aguardandoExtrato.map(r => r.u.id))
      for (const a of app.acordos) for (const p of a.parcelas_acordo) {
        p.recibo_financeiro = porParcela.get(p.id)
        if (p.recibo_financeiro && p.status !== 'cancelada' && !['cancelado', 'renegociado'].includes(a.status)) alvos.add(a.unidade_id)
      }
      let demonstrativo = null
      if (receita.script_key === 'manager_atentum_cotas_pendentes' && receitas.length === 1) {
        const { data } = await db.from('agente_receitas').select('config_json').eq('id', receita.receita_id).single()
        demonstrativo = await medir('Coleta de acordos', () => coletarAcordosManager(data?.config_json?.codigo_cliente, pedido.condominio_id, signal)).catch(() => null)
      } else if (['bbz_condopro_clock_vila_romana', 'captacao_atipass'].includes(receita.script_key)) {
        demonstrativo = await medir('Coleta de acordos', () => coletarAcordosWebware(db, pedido, receita.script_key === 'captacao_atipass' ? 'atipass' : 'bbz', signal)).catch(() => null)
      }
      const acordos = conferirDemonstrativo(demonstrativo, app, base.pendencias)
      const limiteExtratos = pedido.administradora === 'BBZ' ? Math.max(1, 16 * 60_000 - (Date.now() - inicio)) : 0
      const extratos = await medir('Coleta de extratos', () => coletarExtratos(db, pedido, receitas, app, alvos, signal, progresso, limiteExtratos))
      const financeiro = completarFinanceiro(base, extratos, app, salvos, pedido.demonstrativo_repasses, pedido.administradora)
      if (!pedido.aplicar && pedido.administradora === 'BBZ' && extratos.size < alvos.size) {
        cap.avisos.push(`A BBZ retornou consultas de extrato para ${extratos.size} de ${alvos.size} unidades a conferir. As baixas sem comprovação ficam pendentes.`)
      }
      plano = { consultadoEm: new Date().toISOString(), cotas: cap.cotas.length, acordos, ...financeiro,
        fontes: cap.fontes, avisos: cap.avisos, extratosConsultados: extratos.size, alteracoes: base.alteracoes, pendencias: base.pendencias }
    }
    signal.throwIfAborted()
    const { error } = await db.rpc('easy_espelhamento_concluir', {
      p_id: pedido.id, p_tentativa: pedido.tentativas, p_codigo: codigo, p_resultado: plano,
    })
    if (error) throw error
    progresso(`concluído em ${Date.now() - inicio} ms`)
  } catch (error) {
    const motivo = etapa === 'configuração' ? error.message : `O espelhamento foi interrompido na ${etapa}.`
    const detalhe = String(error.message ?? error).split('\n')[0].replace(/https?:\/\/\S+/g, '[link da fonte]')
    const seguro = [config?.usuario, config?.senha].filter(Boolean).reduce((texto, segredo) => texto.replaceAll(segredo, '[credencial]'), detalhe)
    const repetir = error instanceof FalhaTemporariaLello && pedido.tentativas < 2
    const { error: registro } = await db.from('easy_espelhamentos').update(repetir ? {
      estado: 'fila', tentar_em: new Date(Date.now() + 90_000).toISOString(), resultado: null,
    } : {
      estado: 'falha', concluido_em: new Date().toISOString(), resultado: { erro: motivo },
    }).eq('id', pedido.id).eq('estado', 'processando').eq('tentativas', pedido.tentativas)
    if (registro) throw Error('Falha ao registrar o resultado do espelhamento.')
    console.error(`Espelhamento ${pedido.id}: ${repetir ? 'Nova tentativa agendada.' : motivo} ${seguro}`)
  }
}

async function executar() {
  const familia = process.argv[2] ?? 'lello'
  if (!['lello', 'manager', 'webware', 'outros'].includes(familia)) throw Error('Família de agente inválida.')
  const { data, error } = await db.rpc('easy_espelhamento_reservar_familia', { p_familia: familia })
  if (error) throw Error('Não foi possível reservar a fila de espelhamento.')
  const [pedido] = data
  if (pedido) await processar(pedido)
}

executar().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
