import { createClient } from '@supabase/supabase-js'
import { coletarEspelhoLello } from './espelhamento-lello.mjs'
import { confirmarRepassesLello, lerEspelhoApp, planejarEspelhoLello } from './espelhamento-conciliar.mjs'
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
    const progresso = mensagem => console.log(`Espelhamento ${pedido.id}: ${mensagem}`)
    const signal = AbortSignal.timeout(17 * 60_000)
    const { data: salvos, error: erroRepasses } = await db.from('easy_espelhamento_repasses').select('parcela_id,recibo,data_credito,valor_centavos')
      .eq('condominio_id', pedido.condominio_id).eq('carteira_id', pedido.carteira_id)
    if (erroRepasses) throw Error('Não foi possível consultar os repasses já confirmados.')
    let plano, codigo
    if (!pedido.administradora || pedido.administradora === 'Lello') {
      config = await configurar(pedido)
      codigo = config.codigo
      etapa = 'consulta dos relatórios da Lello'
      const portal = await coletarEspelhoLello(config, signal, progresso)
      etapa = 'conciliação com o GKLI Cob'
      const app = await lerEspelhoApp(db, pedido.condominio_id, pedido.carteira_id)
      plano = planejarEspelhoLello(portal, app, codigo)
      plano.repasses = confirmarRepassesLello(plano, portal, app, salvos, pedido.demonstrativo_repasses)
    } else {
      const { data: fontes, error } = await db.rpc('easy_espelhamento_receitas', { p_carteiras: [pedido.carteira_id] })
      if (error) throw Error('Não foi possível validar os agentes do condomínio.')
      const receitas = fontes.filter(r => r.condominio_id === pedido.condominio_id && r.administradora === pedido.administradora)
      if (!receitas.length || new Set(receitas.map(r => r.script_key)).size !== 1) throw Error('Agente ativo ausente ou ambíguo neste condomínio.')
      etapa = 'coleta da inadimplência'
      const [receita] = receitas
      codigo = `receita:${receita.receita_id}`
      const cap = await captarCotasEspelhamento(db, pedido, receitas, signal)
      progresso(`Cotas consultadas: ${cap.cotas.length}`)
      etapa = 'conciliação com o GKLI Cob'
      const app = await lerEspelhoApp(db, pedido.condominio_id, pedido.carteira_id)
      const base = planejarCotasPortais(cap.cotas, app)
      const { data: recibos, error: erroRecibos } = await db.rpc('easy_espelhamento_recibos', { p_condominio: pedido.condominio_id, p_carteira: pedido.carteira_id })
      if (erroRecibos) throw Error('Não foi possível validar os recibos de parcelas do app.')
      const porParcela = new Map(recibos.map(r => [r.id, r.recibo]))
      const alvos = new Set(base.aguardandoExtrato.map(r => r.u.id))
      for (const a of app.acordos) for (const p of a.parcelas_acordo) {
        p.recibo_financeiro = porParcela.get(p.id)
        if (p.recibo_financeiro && p.status !== 'cancelada') alvos.add(a.unidade_id)
      }
      let demonstrativo = null
      if (receita.script_key === 'manager_atentum_cotas_pendentes' && receitas.length === 1) {
        const { data } = await db.from('agente_receitas').select('config_json').eq('id', receita.receita_id).single()
        demonstrativo = await coletarAcordosManager(data?.config_json?.codigo_cliente, pedido.condominio_id, signal).catch(() => null)
      } else if (['bbz_condopro_clock_vila_romana', 'captacao_atipass'].includes(receita.script_key)) {
        demonstrativo = await coletarAcordosWebware(db, pedido, receita.script_key === 'captacao_atipass' ? 'atipass' : 'bbz', signal).catch(() => null)
      }
      const acordos = conferirDemonstrativo(demonstrativo, app, base.pendencias)
      const extratos = await coletarExtratos(db, pedido, receitas, app, alvos, signal, progresso)
      const financeiro = completarFinanceiro(base, extratos, app, salvos, pedido.demonstrativo_repasses, pedido.administradora)
      plano = { consultadoEm: new Date().toISOString(), cotas: cap.cotas.length, acordos, ...financeiro,
        fontes: cap.fontes, alteracoes: base.alteracoes, pendencias: base.pendencias }
    }
    const { error } = await db.rpc('easy_espelhamento_concluir', {
      p_id: pedido.id, p_tentativa: pedido.tentativas, p_codigo: codigo, p_resultado: plano,
    })
    if (error) throw error
    console.log(`Espelhamento ${pedido.id} concluído.`)
  } catch (error) {
    const motivo = etapa === 'configuração' ? error.message : `O espelhamento foi interrompido na ${etapa}.`
    const detalhe = String(error.message ?? error).split('\n')[0].replace(/https?:\/\/\S+/g, '[link da fonte]')
    const seguro = [config?.usuario, config?.senha].filter(Boolean).reduce((texto, segredo) => texto.replaceAll(segredo, '[credencial]'), detalhe)
    const { error: registro } = await db.from('easy_espelhamentos').update({
      estado: 'falha', concluido_em: new Date().toISOString(), resultado: { erro: motivo },
    }).eq('id', pedido.id).eq('estado', 'processando').eq('tentativas', pedido.tentativas)
    if (registro) throw Error('Falha ao registrar o resultado do espelhamento.')
    console.error(`Espelhamento ${pedido.id}: ${motivo} ${seguro}`)
  }
}

async function executar() {
  for (;;) {
    const { data, error } = await db.rpc('easy_espelhamento_reservar')
    if (error) throw Error('Não foi possível reservar a fila de espelhamento.')
    const [pedido] = data
    if (!pedido) return
    await processar(pedido)
  }
}

executar().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
