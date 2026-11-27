import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { importarRetornosGraph, sincronizarCaixaKeila } from '../features/keila/graph-sync'
import { homologarEntradaGraph } from '../features/keila/graph-cojur-homologacao'
import { abrirMicrosoftGraph, configGraphSchema } from '../features/keila/microsoft-graph'
import { POST } from '../app/api/jobs/keila/graph/route'

const desde = new Date(Date.now() - 3_600_000).toISOString()
const agora = new Date().toISOString()
const safira = '2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
const carteira = 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
const unidade = '00000000-0000-4000-8000-000000000001'
const unidadeComAcordo = '00000000-0000-4000-8000-000000000002'
const outroCondominio = '00000000-0000-4000-8000-000000000003'

function email(id: string, extra = {}) {
  return {
    id, conversationId: 'conversa-1', internetMessageId: '<teste@example.com>',
    receivedDateTime: agora, subject: 'Re: cotas do Safira',
    from: { emailAddress: { address: 'contato@example.com' } },
    webLink: 'https://outlook.office.com/mail/id/teste', hasAttachments: false, isDraft: false, ...extra,
  }
}

test('leitura usa token de aplicação, cursor opaco e só acessa a caixa da Keila', async () => {
  const cursor = "https://graph.microsoft.com/v1.0/users('keila%40gekali.com.br')/mailFolders('AQMk=')/messages/delta?$deltatoken=simulado"
  const requisicoes: { url: URL; options?: RequestInit }[] = []
  const fakeFetch: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    requisicoes.push({ url, options })
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'simulado' })
    if (url.pathname.endsWith('/delta')) return Response.json({ value: [], '@odata.deltaLink': cursor })
    return Response.json({ uniqueBody: { contentType: 'text', content: 'Posso parcelar?' } })
  }
  const config = configGraphSchema.parse({ tenant: 'gekali.onmicrosoft.com', aplicativo: unidade, segredo: 'simulado', desde })
  assert.equal(configGraphSchema.safeParse({ ...config, tenant: unidade }).success, true)
  assert.equal(configGraphSchema.safeParse({ ...config, tenant: '../common' }).success, false)
  assert.equal(configGraphSchema.safeParse({ ...config, tenant: 'gekali.onmicrosoft.com.example.com' }).success, false)
  const graph = await abrirMicrosoftGraph(config, AbortSignal.timeout(1000), fakeFetch)
  assert.equal((await graph.pagina(null, desde)).proxima, cursor)
  await graph.pagina(cursor, desde)
  assert.equal(await graph.corpoUnico('A/B+C='), 'Posso parcelar?')
  await assert.rejects(graph.pagina(cursor.replace('graph.microsoft.com', 'example.com'), desde), /fora da caixa/)
  await assert.rejects(graph.pagina(cursor.replace('keila%40gekali.com.br', 'outra%40gekali.com.br'), desde), /fora da caixa/)
  assert.equal(requisicoes.length, 4)
  const token = requisicoes[0]
  assert.equal(token.url.href, 'https://login.microsoftonline.com/gekali.onmicrosoft.com/oauth2/v2.0/token')
  assert.equal(token.options?.method, 'POST')
  assert.equal((token.options?.body as URLSearchParams).get('grant_type'), 'client_credentials')
  assert.equal(requisicoes[1].url.searchParams.get('$filter'), 'receivedDateTime ge ' + desde)
  assert.doesNotMatch(requisicoes[1].url.searchParams.get('$select') ?? '', /(?:^|,)body(?:,|$)/)
  assert.equal(requisicoes[2].url.href, cursor)
  assert.equal(requisicoes[3].url.searchParams.get('$select'), 'uniqueBody')
  for (const request of requisicoes.slice(1)) {
    assert.equal(request.options?.method, 'GET')
    assert.equal(request.options?.redirect, 'error')
    assert.match(new Headers(request.options?.headers).get('prefer') ?? '', /ImmutableId/)
  }
})

test('falha no meio da página preserva o cursor e retoma os retornos sem repetir gravações', async () => {
  const registrados = new Set<string>()
  const corpos: string[] = []
  const proximaUrl = 'https://graph.microsoft.com/v1.0/users/keila%40gekali.com.br/mailFolders/inbox/messages/delta?$deltatoken=fim'
  let checkpoint = { desde, proxima_url: null as string | null, revisao: 0 }
  let falhar = true
  const fakeGraph: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'simulado' })
    if (url.pathname.endsWith('/delta')) {
      return Response.json({ value: [email('primeira'), email('segunda')], '@odata.deltaLink': proximaUrl })
    }
    const id = url.pathname.split('/').at(-1)
    corpos.push(id)
    if (id === 'segunda' && falhar) return new Response(null, { status: 503 })
    return Response.json({ uniqueBody: { contentType: 'text', content: 'Quero parcelar.' } })
  }
  const fakePostgrest: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    const tabela = url.pathname.split('/').at(-1)
    switch (tabela) {
      case 'condominios': return Response.json([{ operacao_virtual_habilitada: true, keila_retornos_desde: desde }])
      case 'keila_graph_cursor':
        if (options?.method === 'POST') return new Response(null, { status: 204 })
        if (options?.method === 'PATCH') {
          assert.equal(url.searchParams.get('revisao'), 'eq.' + checkpoint.revisao)
          checkpoint = { ...checkpoint, ...JSON.parse(String(options.body)) }
          return Response.json([{ id: true }])
        }
        return Response.json(checkpoint)
      case 'keila_graph_recebimentos': {
        const id = url.searchParams.get('message_id')?.slice(3)
        return Response.json(registrados.has(id) ? [{ message_id: id }] : [])
      }
      case 'keila_graph_unidade': return Response.json(unidade)
      case 'keila_graph_registrar': {
        const id = JSON.parse(String(options?.body)).p_message_id
        assert.equal(registrados.has(id), false)
        registrados.add(id)
        return Response.json(unidade)
      }
      default: throw new Error('Requisição inesperada no teste de sincronização.')
    }
  }
  const db = createClient('https://supabase.example', 'simulado', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakePostgrest },
  })
  const config = { desde, tenant: unidade, aplicativo: unidade, segredo: 'simulado' }
  await assert.rejects(sincronizarCaixaKeila(db, config, AbortSignal.timeout(1000), fakeGraph), /Graph indisponível/)
  assert.deepEqual([...registrados], ['primeira'])
  assert.equal(checkpoint.proxima_url, null)
  falhar = false
  assert.deepEqual(await sincronizarCaixaKeila(db, config, AbortSignal.timeout(1000), fakeGraph), {
    registrados: 1, maisPaginas: false, cursorAtualizado: true,
  })
  assert.equal(checkpoint.proxima_url, proximaUrl)
  assert.deepEqual([...registrados], ['primeira', 'segunda'])
  assert.deepEqual(corpos, ['primeira', 'segunda', 'segunda'])
})

test('importação exclui históricos, NDRs e outros condomínios e nunca baixa anexos', async () => {
  const chamados: string[] = []
  const salvos = []
  const registrados = await importarRetornosGraph({
    desde, signal: AbortSignal.timeout(1000),
    itens: [
      email('antigo', { receivedDateTime: '2026-01-01T00:00:00.000Z' }),
      email('removed', { '@removed': { reason: 'deleted' } }),
      email('outro', { subject: 'Pendências no Bosque Marajoara' }),
      email('automatico', { from: { emailAddress: { address: 'postmaster@example.com' } } }),
      email('enviado', { from: { emailAddress: { address: 'keila@gekali.com.br' } } }),
      email('inseguro', { webLink: 'https://outlook.office.com.example.com/mail' }),
      email('duplicado'), email('anexo', { hasAttachments: true }),
      email('sem-vinculo', { from: { emailAddress: { address: 'sem-vinculo@example.com' } } }),
      email('parcelas'), email('boleto'),
    ],
    async jaRegistrado(id) { return id === 'duplicado' },
    async identificar(remetente) { return remetente === 'contato@example.com' },
    async corpoUnico(id) {
      chamados.push(id)
      return id === 'boleto' ? 'Pode mandar o boleto atualizado?' : 'Gostaria de parcelar. Conteúdo privado fictício.'
    },
    async registrar(r) { salvos.push(r) },
  })
  assert.equal(registrados, 4)
  assert.deepEqual(chamados, ['parcelas', 'boleto'])
  assert.deepEqual(salvos.map(r => [r.p_message_id, r.p_intencao, r.p_revisao]), [
    ['anexo', 'outro', 'anexo'], ['sem-vinculo', 'outro', 'conteudo'],
    ['parcelas', 'parcelamento', ''], ['boleto', 'outro', 'pedido_boleto'],
  ])
  assert.doesNotMatch(JSON.stringify(salvos), /Conteúdo privado/)
})

test('rota exige credencial própria e pode ficar desativada sem credenciais do Graph', async () => {
  const anterior = process.env.KEILA_GRAPH_JOB_SECRET
  const ativado = process.env.KEILA_GRAPH_ENABLED
  process.env.KEILA_GRAPH_JOB_SECRET = 'somente-teste'
  process.env.KEILA_GRAPH_ENABLED = 'false'
  try {
    const url = 'https://gkli.example/api/jobs/keila/graph'
    assert.equal((await POST(new Request(url, { method: 'POST' }))).status, 401)
    const resposta = await POST(new Request(url, { method: 'POST', headers: { authorization: 'Bearer somente-teste' } }))
    assert.equal(resposta.status, 200)
    assert.deepEqual(await resposta.json(), { pausado: true })
  } finally {
    if (anterior === undefined) delete process.env.KEILA_GRAPH_JOB_SECRET
    else process.env.KEILA_GRAPH_JOB_SECRET = anterior
    if (ativado === undefined) delete process.env.KEILA_GRAPH_ENABLED
    else process.env.KEILA_GRAPH_ENABLED = ativado
  }
})

test('verificação autenticada lê a caixa da Keila com o processamento pausado', async (t) => {
  const variaveis = {
    KEILA_GRAPH_JOB_SECRET: 'somente-teste',
    KEILA_GRAPH_ENABLED: 'false',
    KEILA_GRAPH_TENANT_ID: 'gekali.onmicrosoft.com',
    KEILA_GRAPH_CLIENT_ID: unidade,
    KEILA_GRAPH_CLIENT_SECRET: 'simulado',
  }
  const anteriores = Object.keys(variaveis).map(chave => [chave, process.env[chave]] as const)
  Object.assign(process.env, variaveis)
  t.after(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) delete process.env[chave]
      else process.env[chave] = valor
    }
  })
  const requisicoes: URL[] = []
  t.mock.method(globalThis, 'fetch', async (input: URL | string) => {
    const url = new URL(input)
    requisicoes.push(url)
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'simulado' })
    assert.equal(url.origin, 'https://graph.microsoft.com')
    assert.equal(url.pathname, '/v1.0/users/keila%40gekali.com.br/mailFolders/inbox/messages/delta')
    return Response.json({ value: [], '@odata.deltaLink': url.origin + url.pathname + '?$deltatoken=teste' })
  })
  const url = 'https://gkli.example/api/jobs/keila/graph?verificar=graph'
  assert.equal((await POST(new Request(url, { method: 'POST' }))).status, 401)
  const resposta = await POST(new Request(url, { method: 'POST', headers: { authorization: 'Bearer somente-teste' } }))
  assert.equal(resposta.status, 200)
  assert.deepEqual(await resposta.json(), { caixaKeilaAcessivel: true })
  assert.equal(requisicoes.length, 2)
})

test('e-mail controlado abre um caso sem destinatário e a releitura reutiliza o mesmo vínculo', async () => {
  const casoId = '00000000-0000-4000-8000-000000000099'
  let registro: { id: string; titulo: string; payload: Record<string, unknown> } | undefined
  let insercoes = 0
  let releituras = 0
  const fakeFetch: typeof fetch = async (input, options) => {
    const url = new URL(String(input))
    const caminho = url.pathname.split('/').at(-1)
    if (url.hostname === 'login.microsoftonline.com') return Response.json({ access_token: 'simulado' })
    if (url.hostname === 'graph.microsoft.com') {
      if (caminho === 'messages') {
        return Response.json({ value: [
          email('outro', { subject: '[Homologação] Safira 200043', from: { emailAddress: { address: 'outro@example.com' } } }),
          email('controlado', { subject: '[Homologação] Safira 200043' }),
        ] })
      }
      assert.equal(caminho, 'controlado')
      if (url.searchParams.get('$select') === 'id') {
        releituras++
        return Response.json({ id: 'controlado' })
      }
      return Response.json({ uniqueBody: { contentType: 'text', content: 'Quais cotas estão em aberto?' } })
    }
    if (caminho === 'central_pendencias') {
      if (options?.method === 'POST') {
        assert.equal(url.searchParams.get('on_conflict'), 'id')
        registro = JSON.parse(String(options.body))
        insercoes++
        return Response.json(registro)
      }
      return Response.json(registro ?? null)
    }
    if (caminho === 'condominios') return Response.json({ operacao_virtual_habilitada: true, keila_retornos_desde: desde })
    if (caminho === 'unidades') {
      assert.equal(url.searchParams.get('identificacao'), 'eq.200043')
      return Response.json([{ id: unidade, identificacao: '200043', condominio_id: safira, carteira_id: carteira, acao_judicial: false }])
    }
    if (caminho === 'acordos') return Response.json(null)
    throw new Error('Requisição inesperada no teste de homologação.')
  }
  const db = createClient('https://supabase.example', 'simulado', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fakeFetch },
  })
  const signal = AbortSignal.timeout(1000)
  const graph = await abrirMicrosoftGraph({ tenant: unidade, aplicativo: unidade, segredo: 'simulado', desde }, signal, fakeFetch)
  assert.deepEqual(await homologarEntradaGraph(db, graph, casoId, desde, signal, 'contato@example.com'),
    { casoId, registrados: 1, repetido: false })
  assert.deepEqual(await homologarEntradaGraph(db, graph, casoId, desde, signal, 'contato@example.com'),
    { casoId, registrados: 0, repetido: true })
  assert.equal(registro?.payload.envio_permitido, false)
  assert.deepEqual(registro?.payload.emails, [])
  assert.equal(insercoes, 1)
  assert.equal(releituras, 1)
})

test('migração persiste retornos em uma transação, preserva aprovações e isola avisos', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(String.raw`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.condominios(id uuid primary key, carteira_id uuid, operacao_virtual_habilitada boolean, keila_retornos_desde timestamptz);
    create table public.unidades(id uuid primary key, condominio_id uuid, carteira_id uuid, email text, identificacao text, responsavel_nome text, acao_judicial boolean);
    create table public.central_pendencias(
      id uuid primary key, carteira_id uuid, condominio_id uuid, unidade_id uuid,
      origem text, tipo text, status text, prioridade text, titulo text, descricao text,
      entidade_tipo text, entidade_id uuid, payload jsonb, updated_at timestamptz default now()
    );
    create table public.avisos (tipo text);
    -- Substitutos dos gatilhos preexistentes verificam se a migração isola só a nova entrada.
    create function public.keila_enfileirar_aviso_boletos() returns trigger language plpgsql as $$
      begin insert into public.avisos values ('boleto'); return new; end $$;
    create function public.agentes_aprendizado_encaminhar() returns trigger language plpgsql as $$
      begin insert into public.avisos values ('acordo'); return new; end $$;
    create trigger keila_enfileirar_aviso_boletos after insert on public.central_pendencias
      for each row execute function public.keila_enfileirar_aviso_boletos();
    create trigger zz_agentes_aprendizado_encaminhar after insert on public.central_pendencias
      for each row execute function public.agentes_aprendizado_encaminhar();
    create function public.agentes_aprendizado_acordos(c public.central_pendencias) returns jsonb language sql as $$
      select case when c.unidade_id = '00000000-0000-4000-8000-000000000002' then '[{}]'::jsonb else '[]'::jsonb end
    $$;
  `)
  const migration = await readFile(new URL('../supabase/migrations/20261126230300_keila_graph_safira.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.query('insert into public.condominios values ($1,$2,true,$3)', [safira, carteira, desde])
  await db.query('insert into public.keila_graph_cursor (desde) values ($1)', [desde])
  await db.query("insert into public.unidades values ($1,$4,$5,'contato@example.com','200035','Moradora teste',false), ($2,$4,$5,'acordo@example.com','200036','Outro contato',false), ($3,$3,$5,'outro@example.com','404','Outro condomínio',false)", [
    unidade, unidadeComAcordo, outroCondominio, safira, carteira,
  ])
  async function registrar(id: string, remetente = 'contato@example.com', revisao = '', assunto = 'Retorno do Safira', recebidoEm = agora) {
    const { rows } = await db.query<{ id: string }>(
      'select public.keila_graph_registrar($1,$2,$3,$4,$5,$6,$7,$8,$9) id',
      [id, 'conversa-1', '<teste@example.com>', remetente, recebidoEm, assunto, 'https://outlook.office.com/mail/id/teste', 'parcelamento', revisao],
    )
    return rows[0].id
  }

  const caso = await registrar('message-A')
  assert.equal(await registrar('message-A'), caso)
  await db.query("update public.central_pendencias set payload=payload||'{\"resposta_aprovada\":{\"id\":\"preservar\"},\"resposta_simulada\":\"Texto aprovado\"}' where id=$1", [caso])
  const avisosAntes = (await db.query('select count(*)::int total from public.avisos')).rows
  assert.deepEqual(avisosAntes, [{ total: 2 }])
  assert.equal(await registrar('message-B'), caso)
  assert.deepEqual((await db.query('select count(*)::int total from public.avisos')).rows, avisosAntes)
  const normal = (await db.query<{ unidade_id: string; payload: { emails: unknown[]; resposta_simulada: string } }>(
    'select unidade_id,payload from public.central_pendencias where id=$1', [caso],
  )).rows[0]
  assert.equal(normal.unidade_id, unidade)
  assert.equal(normal.payload.emails.length, 2)
  assert.equal(normal.payload.resposta_simulada, 'Texto aprovado')

  const revisao = await registrar('message-history', 'acordo@example.com')
  assert.equal(await registrar('message-history-2', 'acordo@example.com'), revisao)
  const suspenso = (await db.query<{ unidade_id: string | null; estado: string }>(
    "select unidade_id,payload->>'estado' estado from public.central_pendencias where id=$1", [revisao],
  )).rows[0]
  assert.deepEqual(suspenso, { unidade_id: null, estado: 'atendimento_humano' })
  assert.deepEqual((await db.query('select count(*)::int total from public.avisos')).rows, avisosAntes)
  assert.doesNotMatch(JSON.stringify(suspenso), /200036/)
  assert.deepEqual((await db.query("select public.keila_graph_unidade('outro@example.com') as unidade")).rows, [{ unidade: null }])
  await assert.rejects(registrar('outro', 'contato@example.com', '', 'Retorno de outro condomínio'), /inválido/)
  await assert.rejects(registrar('antigo', 'contato@example.com', '', 'Safira', '2026-01-01T00:00:00Z'), /indisponível/)

  await db.query("update public.central_pendencias set status='cancelada',tipo='keila_atendimento_arquivado' where id=$1", [caso])
  assert.equal(await registrar('message-A'), caso)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from public.keila_graph_cursor'), /permission denied/)
  await assert.rejects(db.query("select public.keila_graph_unidade('contato@example.com')"), /permission denied/)
})
