import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {evidencia} from './core.mjs'

test('fila real alterna portais, reparte condomínios, mantém intervalo, backoff e cursor',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table condominios(id uuid primary key,carteira_id uuid,status text,administradora text);
  create table agente_receitas(id uuid primary key,carteira_id uuid,script_key text,config_json jsonb,ativo boolean,updated_at timestamptz default now());
  create table unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,identificacao text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,email text,updated_at timestamptz default now());
  create table responsaveis_unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,celular text,telefone_fixo text,telefone_outros text,email text,ativo boolean default true,updated_at timestamptz default now());
  create table test_clock(value timestamptz);insert into test_clock values('2026-10-24 03:30Z');
  create function test_now() returns timestamptz language sql as 'select value from test_clock';
  grant all on condominios,agente_receitas,unidades,responsaveis_unidades,test_clock to service_role;
  create function current_user_is_admin() returns boolean language sql as 'select false';`)
  for(const file of ['20261020121015_scanner_enriquecimento_noturno.sql','20261022123307_scanner_cadastros_auditados.sql','20261022221904_scanner_multiplas_administradoras.sql','20261023130044_scanner_fila_justa_autenticacao.sql'])await db.exec((await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
  await db.exec('create table scanner_lotes_manuais(token uuid,configuracao_id uuid,iniciado_em timestamptz,encerrado_em timestamptz,expira_em timestamptz,unidades text[]);grant select,update on scanner_lotes_manuais to service_role;')
  await db.exec("alter table scanner_evidencias add column conciliacao_status text default 'pendente',add column observado_em timestamptz default test_now()")
  await db.exec((await readFile(new URL('../../supabase/migrations/20261027182731_scanner_retomada_prioritaria_noturna.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
  const car=randomUUID(),porPortal={manager:[],bbz:[],lello:[]}
  for(const portal of ['manager','bbz','lello'])for(let i=0;i<2;i++){
   const condo=randomUUID(),r=randomUUID(),cfg=randomUUID(),unidades=[randomUUID(),randomUUID(),randomUUID()]
   await db.query("insert into condominios values($1,$2,'ativo',$3)",[condo,car,portal])
   const script=portal==='manager'?'manager_atentum_cotas_pendentes':portal==='bbz'?'bbz_condopro_clock_vila_romana':'captacao_lello'
   await db.query('insert into agente_receitas values($1,$2,$3,$4,true,test_now())',[r,car,script,JSON.stringify({condominio_id:condo,codigo_cliente:'123'})])
   await db.query("insert into scanner_configuracoes(id,condominio_id,codigo_portal,perfil_acesso,unidades,ativo,portal,receita_id,situacao,proxima_execucao) values($1,$2,'123','PADRAO',$3,true,$4,$5,'validado',test_now()-interval '1 day')",[cfg,condo,unidades,portal,r])
   porPortal[portal].push(cfg)
  }
  await db.exec('set role service_role')
  await db.exec("update scanner_configuracoes set ultima_tentativa_em=test_now()-interval '1 hour'")
  await db.query("update scanner_configuracoes set ultima_tentativa_em=test_now()-interval '2 hours' where id=$1",[porPortal.manager[0]])
  await db.query("update scanner_configuracoes set retomada_prioritaria_ate=test_now()+interval '1 day',ultima_tentativa_em=test_now()-interval '1 hour' where id=$1",[porPortal.manager[1]])
  const avancar=mins=>db.query("update test_clock set value=value+$1*interval '1 minute'",[mins])
  async function reservar(){const token=randomUUID();return {token,s:(await db.query('select * from scanner_reivindicar($1)',[token])).rows[0]}}
  async function concluir(lote,falha=false){
   const {s,token}=lote,u=s.unidades[s.cursor]
   const ev=falha?[]:[evidencia(u,'contatos',{fichas:[]}),evidencia(u,'pagamentos',{status:'inconclusivo'})]
   await db.query('select scanner_concluir($1,$2,$3,$4)',[token,s.cursor+(falha?0:1),JSON.stringify(ev),falha])
  }
  const m=await reservar();assert.equal(m.s.portal,'manager')
  assert.equal(m.s.id,porPortal.manager[1],'retomada tem prioridade dentro do portal mesmo com tentativa recente')
  await db.exec('reset role')
  await assert.rejects(db.query('select scanner_concluir($1,$2,$3,false)',[m.token,m.s.cursor+21,'[]']),/Lote inválido/)
  await db.exec('set role service_role')
  assert.equal((await reservar()).s,undefined)
  await concluir(m)
  assert.equal((await db.query('select retomada_prioritaria_ate from scanner_configuracoes where id=$1',[m.s.id])).rows[0].retomada_prioritaria_ate,null)
  await avancar(14);assert.equal((await reservar()).s,undefined)
  await avancar(1)
  const b=await reservar();assert.equal(b.s.portal,'bbz');await concluir(b)
  await avancar(15)
  const l=await reservar();assert.equal(l.s.portal,'lello');await concluir(l,true)
  // A falha da Lello não congela os demais portais por 30 minutos.
  await avancar(15)
  const m2=await reservar();assert.equal(m2.s.portal,'manager');assert.notEqual(m2.s.id,m.s.id);await concluir(m2)
  await avancar(15)
  const b2=await reservar();assert.equal(b2.s.portal,'bbz');assert.notEqual(b2.s.id,b.s.id);await concluir(b2)
  await avancar(15)
  const l2=await reservar();assert.equal(l2.s.portal,'lello');assert.notEqual(l2.s.id,l.s.id);await concluir(l2)
  await avancar(15)
  const m3=await reservar();assert.equal(m3.s.id,m.s.id);assert.equal(m3.s.cursor,1);await concluir(m3)
  assert.equal((await db.query('select cursor from scanner_configuracoes where id=$1',[l.s.id])).rows[0].cursor,0)
  // Backoff de uma falha impede qualquer novo login no mesmo portal durante a pausa.
  await db.exec("update scanner_configuracoes set ultima_tentativa_em=test_now()-interval '2 days' where portal='lello';update scanner_configuracoes set falhas=1,ultima_tentativa_em=test_now(),proxima_execucao=test_now()+interval '1 hour' where id='"+l.s.id+"'")
  await avancar(15);const semLello=await reservar();assert.notEqual(semLello.s.portal,'lello');await concluir(semLello)
  await db.exec("update test_clock set value='2026-10-24 08:25Z'")
  assert.equal((await reservar()).s,undefined)
  await db.exec('reset role;set role authenticated')
  await assert.rejects(reservar(),/permission denied/)
 }finally{await db.close()}
})
