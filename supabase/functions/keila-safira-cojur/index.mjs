import { createClient } from 'npm:@supabase/supabase-js@2.108.1'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.2.12'
import { dataBrasilia, referenciaSafira, validarCotas } from './dados.mjs'

const emissor = 'https://token.actions.githubusercontent.com'
const chaves = createRemoteJWKSet(new URL(emissor + '/.well-known/jwks'))
const audiencia = 'gkli-keila-safira-cojur-homologacao'
const ambiente = 'keila-safira-homologacao'
const repositorio = 'gekalicobranca/gkli-cob'
const branch = 'refs/heads/codex/keila-safira-nuvem'
const workflow = `${repositorio}/.github/workflows/keila-safira-cojur.yml@${branch}`
const condominio = '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
const carteira = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const pedidoId = 'cojur-safira-homologacao-pedido-v1'
const entregaId = 'cojur-safira-homologacao-entrega-v1'

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function executar(request) {
  if (!['GET', 'POST'].includes(request.method)) return json({ erro: 'metodo' }, 405)
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]{1,8192})$/)?.[1]
  if (!token) return json({ erro: 'autenticacao' }, 401)
  const identidade = await jwtVerify(token, chaves, {
    issuer: emissor, audience: audiencia, algorithms: ['RS256'], maxTokenAge: '10m',
  }).catch(() => null)
  const claims = identidade?.payload
  const run = claims?.run_id
  if (claims?.repository !== repositorio || claims.repository_id !== '1250756745' ||
      claims.ref !== branch || claims.workflow_ref !== workflow ||
      claims.runner_environment !== 'github-hosted' || claims.environment !== ambiente ||
      claims.sub !== `repo:${repositorio}:environment:${ambiente}` ||
      claims.event_name !== 'push' || typeof run !== 'string' || !/^\d+$/.test(run)) {
    return json({ erro: 'identidade_github' }, 403)
  }

  const idInformado = new URL(request.url).searchParams.get('caso')
  if ((idInformado === null && request.method === 'POST') ||
      (idInformado !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(idInformado))) {
    return json({ erro: 'caso' }, 400)
  }
  const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const consulta = db.from('central_pendencias').select('id,titulo,payload,updated_at,unidade_id')
    .eq('tipo', 'keila_atendimento').eq('condominio_id', condominio).eq('carteira_id', carteira)
    .eq('status', 'em_tratamento')
    .contains('payload', { registro_json: { eventos: [{ id: pedidoId, dados: { workflow_ref: workflow } }] } })
    .limit(2)
  if (idInformado !== null) consulta.eq('id', idInformado)
  const { data: caso, error: erroCaso } = await consulta.maybeSingle()
  if (erroCaso) return json({ erro: 'consulta_gkli' }, 503)
  const payload = caso?.payload
  const eventos = payload?.registro_json?.eventos
  const pedido = Array.isArray(eventos) ? eventos.find(e => e.id === pedidoId) : undefined
  const expira = Date.parse(pedido?.dados?.expira_em ?? '')
  const agora = Date.now()
  if (!caso?.titulo.startsWith('[HOMOLOGAÇÃO COJUR]') || payload?.modo !== 'supervisionado' ||
      payload.envio_permitido !== false || payload.emails?.length !== 0 || payload.resposta_aprovada ||
      payload.resposta_simulada || payload.contato_proativo ||
      payload.unidade_ids?.length !== 1 || payload.unidade_ids[0] !== caso.unidade_id ||
      pedido?.dados?.referencia !== referenciaSafira || !Number.isFinite(expira) ||
      expira <= agora || expira - agora > 24 * 60 * 60 * 1000) return json({ erro: 'caso_fora_da_homologacao' }, 404)
  const id = caso.id

  const { data: unidade, error: erroUnidade } = await db.from('unidades').select('identificacao')
    .eq('id', caso.unidade_id).eq('condominio_id', condominio).eq('carteira_id', carteira).maybeSingle()
  if (erroUnidade || !unidade || !/^\d{6}$/.test(unidade.identificacao) || unidade.identificacao !== pedido.dados.unidade) {
    return json({ erro: 'unidade_divergente' }, 409)
  }
  const entregue = eventos.find(e => e.id === entregaId)
  if (entregue) return json({ caso_id: id, concluido: true, quantidade: entregue.dados.cotas.length })
  const revisaoDoLote = payload.homologacao_lote === 'safira-reais-homologacao-20261128' &&
    payload.estado === 'atendimento_humano'
  if (payload.estado !== 'buscando_debitos' && !revisaoDoLote) return json({ erro: 'estado_do_caso' }, 409)
  if (request.method === 'GET') return json({ caso_id: id, referencia: referenciaSafira, unidade: unidade.identificacao })

  const texto = await request.text()
  if (texto.length > 65_536) return json({ erro: 'limite_de_dados' }, 413)
  let coleta
  let total
  try {
    coleta = JSON.parse(texto)
    const quando = Date.parse(coleta.consultado_em)
    if (coleta.referencia !== referenciaSafira || coleta.unidade !== unidade.identificacao ||
        !Number.isFinite(quando) || quando > agora + 60_000 || agora - quando > 15 * 60 * 1000 ||
        dataBrasilia(quando) !== dataBrasilia(agora)) throw new Error('escopo')
    total = validarCotas(coleta.cotas)
  } catch {
    return json({ erro: 'coleta_invalida' }, 422)
  }
  const cotas = coleta.cotas.map(cota => ({
    recibo: cota.recibo, vencimento: cota.vencimento, principal_centavos: cota.principal_centavos,
    multa_centavos: cota.multa_centavos, correcao_juros_centavos: cota.correcao_juros_centavos,
    total_centavos: cota.total_centavos,
  }))
  const em = new Date().toISOString()
  const resumo = `COJUR consultado no GitHub Actions hospedado. ${cotas.length} cota(s) sem acordo registradas para conferência.`
  const entrega = {
    id: entregaId, tipo: 'consulta_remota', em, resumo,
    dados: { referencia: referenciaSafira, unidade: unidade.identificacao, consultado_em: coleta.consultado_em,
      origem: 'github-hosted', github_run_id: run, total_centavos: total, cotas },
  }
  const { data: salvo, error: erroSalvo } = await db.from('central_pendencias').update({
    descricao: resumo, updated_at: em, payload: {
      ...payload, estado: revisaoDoLote ? 'atendimento_humano' : 'em_analise', proxima_acao: resumo,
      atividades: [...payload.atividades, { em, descricao: resumo }],
      registro_json: { versao: 1, eventos: [...eventos, entrega] },
    },
  }).eq('id', id).eq('updated_at', caso.updated_at).eq('status', 'em_tratamento').select('id').maybeSingle()
  if (erroSalvo) return json({ erro: 'gravacao_gkli' }, 503)
  if (!salvo) return json({ erro: 'caso_atualizado' }, 409)
  return json({ caso_id: salvo.id, concluido: true, quantidade: cotas.length })
}

Deno.serve(async request => {
  try {
    return await executar(request)
  } catch {
    return json({ erro: 'homologacao_indisponivel' }, 503)
  }
})
