const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const clock=s=>s.replaceAll('clock_timestamp()','public.test_now()').replaceAll('now()','public.test_now()').replaceAll('test_public.test_now()','test_now()');
test('cotas e cadência por conta autenticada preservam as travas do envio',async t=>{
 const db=new PGlite();try{
 await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create table fake_clock(t timestamptz);insert into fake_clock values('2050-10-26T01:00Z');
 create function test_now()returns timestamptz language sql as $$select t from fake_clock$$;
 create table carteiras(id uuid primary key,email_limite_diario int default 50 constraint carteiras_email_limite_diario_check check(email_limite_diario between 1 and 50),email_habilitado boolean default true,email_transporte text default 'smtp');
 create table condominios(id uuid primary key,carteira_id uuid);
 create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,status text default 'em_cobranca_ativa',automacao_bloqueada boolean default false);
 create table acordos(id uuid primary key,carteira_id uuid,condominio_id uuid);
 create table cobranca_flows(id uuid primary key,status text default 'em_execucao');create table acordo_flows(id uuid primary key,status text);create table pre_juridico_flows(id uuid primary key,status text);
 create table mensagens(id uuid primary key,carteira_id uuid,cobranca_id uuid,acordo_id uuid,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,canal text default 'email',status text default 'agendada',status_operacional text,scheduled_at timestamptz,agendada_para timestamptz,proxima_tentativa_em timestamptz,erro text,erro_envio text,payload jsonb default '{}');
 create table email_agenda(mensagem_id uuid primary key,carteira_id uuid,remetente text,agendada_para timestamptz);
 create table email_tentativas(id uuid default gen_random_uuid() primary key,mensagem_id uuid,carteira_id uuid,remetente text,iniciado_em timestamptz,finalizado_em timestamptz,estado text);
 create table integracoes_smtp_config(id uuid primary key,carteira_id uuid,usuario text,ativo boolean default true,atualizado_em timestamptz default test_now());
 create table integracoes_smtp_rotas_condominio(condominio_id uuid primary key,carteira_id uuid,smtp_config_id uuid,ativo boolean default true);
 create table thunderbird_dispositivos(id uuid primary key,carteira_id uuid,email text,ativo boolean default true,automatico boolean default true,testado_em timestamptz default test_now(),visto_em timestamptz);
 create table thunderbird_envios(id uuid default gen_random_uuid() primary key,dispositivo_id uuid,mensagem_id uuid,tentativa_id uuid,tipo text,estado text default 'pendente',destinatario text,assunto text,corpo text,criado_em timestamptz default test_now(),atualizado_em timestamptz default test_now());
 create function email_aviso_interno_autorizado(m mensagens)returns boolean language sql as $$select coalesce((m.payload->>'interno')::boolean,false)$$;
 create function email_excecao_teste_autorizada(m mensagens)returns boolean language sql as $$select false$$;
 create function email_liberacao_imediata_autorizada(m mensagens,p_at timestamptz default test_now())returns boolean language sql as $$select coalesce((m.payload->>'manual')::boolean,false)$$;
 create function agente_proposta_mensagem_elegivel(m mensagens)returns boolean language sql as $$select true$$;
 create function flow_cobranca_mensagem_elegivel(m mensagens)returns boolean language sql as $$select exists(select 1 from cobrancas where id=m.cobranca_id and status='em_cobranca_ativa' and not automacao_bloqueada)$$;
 create function flow_cancelar_mensagem(p_id uuid)returns void language sql as $$update mensagens set status='cancelada' where id=p_id$$;
 create schema cron;create table cron.job(jobid bigint,jobname text,schedule text,active boolean);insert into cron.job values(1,'gkli-email-agenda','*/10 1-8 * * *',true);
 create function cron.alter_job(p_jobid bigint,schedule text)returns void language sql as $$update cron.job set schedule=$2 where jobid=$1$$;
 `);
 await db.exec(clock(fs.readFileSync('scripts/fixtures/email-agenda-pre-contas.sql','utf8')));
 for(let w=1;w<=4;w++){
  await db.query('insert into carteiras(id,email_transporte)values($1,$2)',[id(w),w===4?'thunderbird':'smtp']);
  await db.query('insert into condominios values($1,$2)',[id(100+w),id(w)]);
  await db.query('insert into cobranca_flows(id)values($1)',[id(200+w)]);
  await db.query('insert into integracoes_smtp_config(id,carteira_id,usuario)values($1,$2,$3)',[id(300+w),id(w),w===2?'camila@shared.example':'lidia@shared.example']);
 }
 await db.query("insert into thunderbird_dispositivos(id,carteira_id,email)values($1,$2,'operacao@azevedo.example')",[id(404),id(4)]);
 async function message(n,w=1,condo=100+w){const k=id(n);await db.query('insert into cobrancas(id,carteira_id,condominio_id)values($1,$2,$3)',[k,id(w),id(condo)]);await db.query('insert into mensagens(id,carteira_id,cobranca_id,cobranca_flow_id)values($1,$2,$1,$3)',[k,id(w),id(200+w)]);return k;}
 // Tentativa anterior à alteração: seu agrupamento original deve permanecer auditável.
 const legacy=await message(900);await db.query("insert into email_tentativas(mensagem_id,carteira_id,remetente,iniciado_em,estado)values($1,$2,'shared.example',test_now(),'enviado')",[legacy,id(1)]);
 await db.exec(clock(fs.readFileSync('supabase/migrations/20261026193107_email_cem_por_conta_intervalo_dois_minutos.sql','utf8')));
 await db.exec('update carteiras set email_limite_diario=100');
 const one=async(s,p=[]) => (await db.query(s,p)).rows[0];
 await t.test('histórico, privilégios e cron ficam coerentes',async()=>{
  const old=await one('select remetente,conta_envio from email_tentativas where mensagem_id=$1',[legacy]);assert.equal(old.remetente,'shared.example');assert.equal(old.conta_envio,'lidia@shared.example');
  assert.equal((await one('select schedule from cron.job')).schedule,'*/2 1-8 * * *');
  assert.equal((await one("select has_function_privilege('authenticated','email_conta_envio(uuid)','EXECUTE') b")).b,false);
 });
 async function scenario(fn){await db.exec('begin;delete from email_tentativas;delete from email_agenda;');try{await fn()}finally{await db.exec('rollback')}}
 const reserve=async(k,input='shared.example')=>(await one('select email_reservar_horario($1,$2) slot',[k,input])).slot;
 const claim=async(k,input)=>(await one('select email_reservar_disparo_interno($1,$2) r',[k,input])).r;
 async function rejectsQuery(fn,pattern){await db.exec('savepoint expected_error');try{await assert.rejects(fn,pattern)}finally{await db.exec('rollback to savepoint expected_error;release savepoint expected_error')}}
 await t.test('contas distintas do mesmo domínio usam o mesmo horário em filas independentes',()=>scenario(async()=>{
  const a=await message(1000,1),b=await message(1001,2);assert.equal(new Date(await reserve(a)).getTime(),new Date(await reserve(b)).getTime());
  assert.equal((await claim(a,'lidia@shared.example')).permitido,true);assert.equal((await claim(b,'camila@shared.example')).permitido,true);
 }));
 await t.test('a mesma conta mantém dois minutos mesmo em carteiras diferentes',()=>scenario(async()=>{
  const a=await message(1100,1),b=await message(1101,3);const sa=await reserve(a),sb=await reserve(b);assert.equal(new Date(sb)-new Date(sa),120000);
  assert.equal((await claim(a,'lidia@shared.example')).permitido,true);
  await db.query("update fake_clock set t=t+interval '1 minute'");await db.query('update email_agenda set agendada_para=test_now() where mensagem_id=$1',[b]);
  assert.equal((await claim(b,'lidia@shared.example')).permitido,false);
  assert.equal((await one('select count(*)::int n from email_tentativas')).n,1);
 }));
 await t.test('100 é o teto real somando carteiras; o 101º vai para outro dia',()=>scenario(async()=>{
  await db.exec("update fake_clock set t='2050-10-26T05:00Z'");
  const dates=[];for(let i=0;i<101;i++){const m=await message(2000+i,i%2?1:3);dates.push(await reserve(m));}
  assert.equal(new Date(dates[99])-new Date(dates[0]),99*120000);
  assert.notEqual(new Date(dates[100]).toISOString().slice(0,10),new Date(dates[99]).toISOString().slice(0,10));
  await db.exec("delete from email_agenda;insert into email_tentativas(carteira_id,remetente,conta_envio,iniciado_em,estado)select '"+id(3)+"','lidia@shared.example','lidia@shared.example',test_now()-interval '2 hours','enviado' from generate_series(1,100)");
  const m=await message(2200,1);assert.ok(new Date(await reserve(m))>new Date('2050-10-26T03:00Z'));
  // Uma reserva antiga/forjada não pode ultrapassar a cota real.
  await db.query('update email_agenda set agendada_para=test_now() where mensagem_id=$1',[m]);assert.equal((await claim(m,'lidia@shared.example')).permitido,false);
 }));
 await t.test('rota administrativa escolhe Lídia dentro da carteira padrão Camila',()=>scenario(async()=>{
  await db.query('insert into condominios values($1,$2)',[id(120),id(2)]);await db.query('insert into integracoes_smtp_rotas_condominio(condominio_id,carteira_id,smtp_config_id)values($1,$2,$3)',[id(120),id(2),id(301)]);
  const m=await message(3000,2,120);await reserve(m,'camila@shared.example');assert.equal((await one('select remetente from email_agenda where mensagem_id=$1',[m])).remetente,'lidia@shared.example');
  await rejectsQuery(()=>claim(m,'camila@shared.example'),/diverge/);
  assert.equal((await claim(m,'lidia@shared.example')).permitido,true);
 }));
 await t.test('aliases não criam novas cotas e as pausas, incertezas e bloqueios continuam valendo',()=>scenario(async()=>{
  const a=await message(4000),b=await message(4001),c=await message(4002);await reserve(a,'alias@shared.example');assert.equal((await one('select remetente from email_agenda where mensagem_id=$1',[a])).remetente,'lidia@shared.example');
  await rejectsQuery(()=>claim(a,'alias@shared.example'),/diverge/);
  await db.query("update cobranca_flows set status='pausado' where id=$1",[id(201)]);assert.equal((await claim(a,'lidia@shared.example')).permitido,false);
  await db.query("update cobranca_flows set status='em_execucao' where id=$1",[id(201)]);
  await db.query("insert into email_tentativas(mensagem_id,carteira_id,remetente,conta_envio,iniciado_em,estado)values($1,$2,'lidia@shared.example','lidia@shared.example',test_now(),'incerto')",[b,id(1)]);await rejectsQuery(()=>reserve(b),/tentativa/);
  await reserve(c);await db.query('update cobrancas set automacao_bloqueada=true where id=$1',[c]);assert.equal((await claim(c,'lidia@shared.example')).permitido,false);
 }));
 await t.test('janela padrão é mantida e a liberação diurna segue a cadência de dois minutos',()=>scenario(async()=>{
  await db.exec("update fake_clock set t='2050-10-26T18:00Z'");const a=await message(5000),b=await message(5001);
  const normal=await reserve(a);assert.equal(new Date(normal).toISOString(),'2050-10-27T01:00:00.000Z');assert.equal((await claim(a,'lidia@shared.example')).permitido,false);
  await db.exec('delete from email_agenda');await db.query("update mensagens set payload='{\"manual\":true}' where id in($1,$2)",[a,b]);const sa=await reserve(a),sb=await reserve(b);assert.equal(new Date(sa).toISOString(),'2050-10-26T18:00:00.000Z');assert.equal(new Date(sb)-new Date(sa),120000);
 }));
 await t.test('Thunderbird usa a conta completa e não reserva duplicado',()=>scenario(async()=>{
  const m=await message(6000,4);await reserve(m);assert.equal((await one('select remetente from email_agenda where mensagem_id=$1',[m])).remetente,'operacao@azevedo.example');
  const job=(await one('select thunderbird_reservar($1,false) r',[id(404)])).r;assert.equal(job.mensagem_id,m);
  assert.equal((await one('select thunderbird_reservar($1,false) r',[id(404)])).r,null);
  assert.equal((await one('select remetente from email_tentativas where mensagem_id=$1',[m])).remetente,'operacao@azevedo.example');
 }));
 }finally{await db.close()}
});
