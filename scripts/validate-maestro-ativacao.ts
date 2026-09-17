import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('ativação: somente novos, pausas, idempotência, bloqueios e rollback', async () => {
  const db = new PGlite()
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table carteiras(id uuid primary key);
    create table condominios(id uuid primary key,carteira_id uuid,status text);
    create table cobranca_flows(id uuid primary key,carteira_id uuid,status text,total_mensagens int,payload jsonb);
    create table automacao_controle(chave text,ativo bool);
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada bool);
    create table lote_itens(cobranca_id uuid,cobranca_flow_id uuid,status text);
    create table acordos(id uuid primary key,cobranca_id uuid,status text);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
    create table mensagens(cobranca_flow_id uuid,canal text,status text,email_destinatario text,destinatario text);
    create table reservas(flow_id uuid);
    create function email_ativar_flow(p_flow uuid,p_remetente text,p_usuario uuid) returns integer language plpgsql as $$
    begin
      insert into reservas values(p_flow);
      if p_remetente='falha' then raise exception 'Falha simulada de agenda'; end if;
      update cobranca_flows set status='em_execucao' where id=p_flow;
      return 1;
    end $$;
    insert into carteiras values('${id(1)}');
    insert into condominios values('${id(2)}','${id(1)}','ativo');
    insert into automacao_controle values('captacao_global',true);
    insert into cobranca_flows values('${id(3)}','${id(1)}','pronto',1,'{"origem":"maestro"}');
  `)
  const sql = readFileSync('supabase/migrations/20260917190000_maestro_ativacao_automatica.sql','utf8').split('create or replace function public.maestro_flow_tick()')[0]
  await db.exec(sql + 'commit;')
  assert.equal((await db.query('select * from maestro_flow_ativacoes')).rows.length, 0)
  await db.exec('update maestro_flow_controle set ativo=true')
  const novo = async (n: number, origem = 'maestro') => {
    await db.query('insert into cobranca_flows values($1,$2,$3,1,$4)',[id(n),id(1),'pronto',JSON.stringify({origem,condominio_id:id(2)})])
    await db.query("insert into mensagens values($1,'email','pendente_aprovacao','a@example.com',null)",[id(n)])
  }
  const ativar = async (n: number, remetente = 'smtp') => (await db.query<any>('select maestro_flow_ativar($1,$2) estado',[id(n),remetente])).rows[0].estado
  await novo(4,'manual')
  assert.equal(await ativar(4),'ignorado')
  await novo(5)
  await db.exec('update maestro_flow_controle set ativo=false')
  assert.equal(await ativar(5),'pausado')
  await db.exec('update maestro_flow_controle set ativo=true; update automacao_controle set ativo=false')
  assert.equal(await ativar(5),'pausado')
  await db.exec('update automacao_controle set ativo=true')
  assert.equal(await ativar(5),'ativado')
  assert.equal(await ativar(5),'ignorado')
  assert.equal((await db.query('select * from reservas')).rows.length,1)
  await novo(6)
  assert.equal(await ativar(6,'falha'),'atencao')
  assert.equal((await db.query('select * from reservas')).rows.length,1)
  await novo(7)
  await db.query("insert into cobrancas values($1,$2,$3,'novo','novo','em_aberto',true)",[id(8),id(1),id(2)])
  await db.query("insert into lote_itens values($1,$2,'criado')",[id(8),id(7)])
  assert.equal(await ativar(7),'atencao')
  await novo(9)
  await db.query("update mensagens set email_destinatario='invalido' where cobranca_flow_id=$1",[id(9)])
  assert.equal(await ativar(9),'atencao')
  await novo(10)
  await db.query("update cobranca_flows set status='pausado' where id=$1",[id(10)])
  assert.equal(await ativar(10),'manual')
  await novo(11)
  await db.query("update cobrancas set automacao_bloqueada=false where id=$1",[id(8)])
  await db.query("insert into lote_itens values($1,$2,'criado')",[id(8),id(11)])
  await db.query("insert into acordos values($1,null,'ativo')",[id(12)])
  await db.query("insert into acordo_cobrancas values($1,$2)",[id(12),id(8)])
  assert.equal(await ativar(11),'atencao')
  assert.equal((await db.query('select * from reservas')).rows.length,1)
  await db.close()
})
