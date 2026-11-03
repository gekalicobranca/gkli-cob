import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { summarizeWhatsappDay } from '../features/mensageria/whatsapp-daily-summary'

const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table test_clock(t timestamptz); insert into test_clock values('2026-11-03 16:00:00Z');
      create function test_now() returns timestamptz stable language sql as $$select t from test_clock$$;
      create table carteiras(id uuid primary key,whatsapp_transporte text,whatsapp_web_sessao text,whatsapp_web_numero text);
      create table condominios(id uuid primary key,carteira_id uuid,grupo text);
      create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid);
      create table acordos(id uuid primary key,carteira_id uuid,condominio_id uuid);
      create table whatsapp_web_sessoes(id text,numero text,status text,atualizado_em timestamptz);
      create table cobranca_flows(id uuid primary key,status text);
      create table acordo_flows(id uuid primary key,status text);
      create table pre_juridico_flows(id uuid primary key,status text);
      create table mensagens(id uuid primary key,carteira_id uuid,cobranca_id uuid,acordo_id uuid,canal text,status text,agendada_para timestamptz,proxima_tentativa_em timestamptz,provider_message_id text,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,lote_id uuid,payload jsonb default '{}',provider text,provider_status text,ultima_tentativa_em timestamptz,tentativas_envio int default 0);
      create table whatsapp_web_envios(token uuid default gen_random_uuid(),mensagem_id uuid,sessao text,numero text,estado text,iniciado_em timestamptz default test_now(),finalizado_em timestamptz,recibos jsonb default '[]');
      create function workers_whatsapp_permitido() returns boolean language sql as $$select true$$;
      create function keila_whatsapp_elegivel(m mensagens) returns boolean language sql as $$select false$$;
      create function whatsapp_consolidar_lote(l uuid) returns void language plpgsql as $$begin end$$;
      create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select true$$;
      create function flow_cancelar_mensagem(m uuid) returns void language plpgsql as $$begin end$$;
    `)
    await db.exec(readFileSync('scripts/fixtures/whatsapp-web-reservar-limite-diario.sql', 'utf8'))
    await db.exec('alter table mensagens add column conteudo text; alter table mensagens add column conteudo_renderizado text;')
    await db.exec(readFileSync('supabase/migrations/20261023134005_whatsapp_limite_20_janela_movel_24h.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261103191824_whatsapp_rotas_grupo_carteira.sql', 'utf8'))
    const definition = (await db.query<{ src: string }>("select pg_get_functiondef('whatsapp_web_reservar(text,text)'::regprocedure) src")).rows[0].src
    await db.exec(definition.replaceAll('now()', 'test_now()'))
    const route = async (n: number) => (await db.query<any>('select whatsapp_web_rota_mensagem($1) r', [id(n)])).rows[0].r
    const reserve = async (session: string, phone: string) => (await db.query<any>('select whatsapp_web_reservar($1,$2) r', [session, phone])).rows[0].r
    const reset = async () => {
      await db.exec(`
        truncate whatsapp_web_rotas_grupo,carteiras,mensagens,condominios,cobrancas,acordos,whatsapp_web_envios,whatsapp_web_sessoes,cobranca_flows;
        insert into carteiras values('${id(1)}','web','gekali','5511914750545'),('${id(2)}','web','other','5511999990000');
        insert into condominios values('${id(11)}','${id(1)}','RISE UP'),('${id(12)}','${id(1)}','VALENTE GOMES'),('${id(13)}','${id(2)}','RISE UP');
        insert into cobrancas values('${id(21)}','${id(1)}','${id(11)}'),('${id(22)}','${id(1)}','${id(12)}'),('${id(23)}','${id(2)}','${id(13)}');
        insert into acordos values('${id(25)}','${id(1)}','${id(11)}');
        insert into whatsapp_web_rotas_grupo(carteira_id,grupo,sessao,numero) values('${id(1)}','RISE UP','riseup','5511973641030');
        insert into whatsapp_web_sessoes values('riseup','5511973641030','conectado',test_now()),('gekali','5511914750545','conectado',test_now()),('other','5511999990000','conectado',test_now());
        insert into cobranca_flows values('${id(31)}','em_execucao'),('${id(32)}','pausado');
        insert into mensagens(id,carteira_id,cobranca_id,canal,status,agendada_para,cobranca_flow_id,payload) values
        ('${id(41)}','${id(1)}','${id(21)}','whatsapp','agendada','2020-01-01','${id(31)}','{"destinatario_regua":{"email":"email@example.com"}}'),
        ('${id(42)}','${id(1)}','${id(22)}','whatsapp','agendada','2020-01-01','${id(31)}','{}'),
        ('${id(43)}','${id(2)}','${id(23)}','whatsapp','agendada','2020-01-01','${id(31)}','{}'),
        ('${id(44)}','${id(1)}','${id(21)}','whatsapp','agendada','2026-11-02','${id(31)}','{"destinatario_regua":{"email":null}}'),
        ('${id(45)}','${id(1)}','${id(21)}','whatsapp','agendada','2019-01-01','${id(32)}','{"destinatario_regua":{"email":null}}');
      `)
    }
    await reset()
    await db.exec(`update mensagens set conteudo='GEKALI — 11 91475-0545',conteudo_renderizado='GEKALI — 11 91475-0545' where id in('${id(41)}','${id(42)}')`)
    assert.equal((await db.query<any>('select conteudo from mensagens where id=$1', [id(41)])).rows[0].conteudo, 'GEKALI — 11 97364-1030')
    assert.equal((await db.query<any>('select conteudo from mensagens where id=$1', [id(42)])).rows[0].conteudo, 'GEKALI — 11 91475-0545')
    await db.exec(`update mensagens set cobranca_id='${id(22)}' where id='${id(41)}'`)
    assert.equal((await db.query<any>('select conteudo from mensagens where id=$1', [id(41)])).rows[0].conteudo, 'GEKALI — 11 91475-0545', 'corrige a assinatura ao voltar para a rota padrão')
    await db.exec(`update mensagens set status='enviada',conteudo='Histórico — 11 91475-0545',cobranca_id='${id(21)}' where id='${id(41)}'`)
    assert.equal((await db.query<any>('select conteudo from mensagens where id=$1', [id(41)])).rows[0].conteudo, 'Histórico — 11 91475-0545', 'preserva texto histórico')
    await reset()
    assert.equal((await route(41)).sessao, 'riseup')
    assert.equal((await route(42)).sessao, 'gekali')
    assert.equal((await route(43)).sessao, 'other', 'grupo com mesmo nome não atravessa carteira')
    assert.equal((await reserve('gekali','5511914750545')).id, id(42), 'linha padrão não captura Rise Up')
    assert.equal((await reserve('riseup','5511973641030')).id, id(44), 'prioriza sem e-mail e preserva o flow pausado')
    assert.equal((await db.query<any>('select status from cobranca_flows where id=$1', [id(32)])).rows[0].status, 'pausado')
    await reset()
    await db.exec("update whatsapp_web_rotas_grupo set ativo=false")
    assert.equal(await route(41), null, 'rota inativa não cai silenciosamente na linha padrão')
    assert.equal(await reserve('riseup','5511973641030'), null)
    assert.equal((await reserve('gekali','5511914750545')).id, id(42))
    await reset()
    await db.exec(`update mensagens set acordo_id='${id(25)}',cobranca_id=null where id='${id(41)}'`)
    assert.equal((await route(41)).sessao, 'riseup', 'acordos usam o mesmo grupo verificado')
    await db.exec(`update mensagens set carteira_id='${id(2)}' where id='${id(41)}'`)
    assert.equal(await route(41), null, 'vínculo financeiro de outra carteira é recusado')
    await reset()
    await db.exec("insert into whatsapp_web_envios(sessao,numero,estado,iniciado_em) select 'alias','5511973641030','incerto',test_now()-interval '20 hours' from generate_series(1,20)")
    assert.equal(await reserve('riseup','5511973641030'), null, 'atrasados e aliases respeitam 20 em 24h incluindo incertos')
    assert.equal((await reserve('gekali','5511914750545')).id, id(42), 'novo número não consome a cota da linha padrão')
    await reset()
    await db.exec(`update mensagens set provider_message_id='confirmado' where id='${id(44)}';
      insert into whatsapp_web_envios(mensagem_id,sessao,numero,estado,iniciado_em) values('${id(41)}','riseup','5511973641030','incerto',test_now()-interval '25 hours')`)
    assert.equal(await reserve('riseup','5511973641030'), null, 'não reenvia incerto nem mensagem já confirmada')
    const privileges = (await db.query<any>("select has_table_privilege('anon','whatsapp_web_rotas_grupo','SELECT') anon,has_table_privilege('authenticated','whatsapp_web_rotas_grupo','SELECT') authenticated,has_function_privilege('anon','whatsapp_web_rota_mensagem(uuid)','EXECUTE') rpc_anon,has_function_privilege('service_role','whatsapp_web_rota_mensagem(uuid)','EXECUTE') service")).rows[0]
    assert.deepEqual(privileges, { anon: false, authenticated: false, rpc_anon: false, service: true })
    const summary = summarizeWhatsappDay([
      { mensagem_id: 'a', sessao: 'gekali', estado: 'enviado', iniciado_em: '2026-11-03T12:00:00Z', finalizado_em: '2026-11-03T12:00:01Z', mensagem: { status: 'enviada' } },
      { mensagem_id: 'b', sessao: 'riseup', estado: 'enviado', iniciado_em: '2026-11-03T12:10:00Z', finalizado_em: '2026-11-03T12:10:01Z', mensagem: { status: 'enviada' } },
    ], [], [{ id: 'wallet', whatsapp_web_sessao: 'gekali' }, { id: 'wallet', whatsapp_web_sessao: 'riseup' }], '2026-11-03T03:00:00Z', '2026-11-04T03:00:00Z')
    assert.equal(summary.byWallet.wallet.sent, 2)
    assert.equal(summary.total.sent, 2, 'duas linhas somam na mesma carteira sem duplicar totais')
    console.log('OK: rotas por grupo/carteira, acordos, bloqueio sem fallback, prioridade sem e-mail, pausados, incertos, cota física móvel, permissões privadas e totais da GEKALI.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
