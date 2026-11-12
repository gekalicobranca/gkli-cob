import { createClient } from '@supabase/supabase-js'
import { coletarEspelhoLello } from './espelhamento-lello.mjs'
import { lerEspelhoApp, planejarEspelhoLello } from './espelhamento-conciliar.mjs'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
    config = await configurar(pedido)
    etapa = 'consulta dos relatórios da Lello'
    const portal = await coletarEspelhoLello(config, AbortSignal.timeout(12 * 60_000), mensagem => console.log(`Espelhamento ${pedido.id}: ${mensagem}`))
    etapa = 'conciliação com o GKLI Cob'
    const app = await lerEspelhoApp(db, pedido.condominio_id, pedido.carteira_id)
    const plano = planejarEspelhoLello(portal, app, config.codigo)
    const { error } = await db.rpc('easy_espelhamento_concluir', {
      p_id: pedido.id, p_tentativa: pedido.tentativas, p_codigo: config.codigo, p_resultado: plano,
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
