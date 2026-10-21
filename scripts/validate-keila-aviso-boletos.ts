import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const clock=(sql:string)=>sql.replaceAll('clock_timestamp()','public.test_now()').replaceAll('now()','public.test_now()').replaceAll('test_public.test_now()','test_now()')
async function main(){
 const db=new PGlite()
 try{
  const schema=readFileSync('scripts/validate-email-agenda.ts','utf8').split('await db.exec(`')[1].split('`)')[0]
  await db.exec(schema)
  await db.exec("create or replace function test_now() returns timestamptz language sql as 'select t from public.fake_clock';")
  await db.exec(clock(readFileSync('supabase/migrations/20260916170000_agenda_email_carteira.sql','utf8')))
  await db.exec(`create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select true$$;`)
  await db.exec(clock(readFileSync('supabase/migrations/20260922190000_thunderbird_envios.sql','utf8')))
  await db.exec(`
   alter table mensagens add column contexto text,add column destinatario text,add column email_assunto text;
   create schema auth;create function auth.uid() returns uuid language sql as $$select '${id(9)}'::uuid$$;
   create table central_pendencias(id uuid primary key,tipo text,carteira_id uuid,condominio_id uuid,status text,descricao text,payload jsonb,updated_at timestamptz);
   create table acordos(id uuid primary key,unidade_id uuid,carteira_id uuid,condominio_id uuid,devedor_aceito_em timestamptz,status text);
   create table condominios(id uuid,carteira_id uuid,nome text);
   create function email_processar_agenda() returns bigint language plpgsql as $$begin
    return 123;end$$;
   create schema cron;create table cron.job(jobid bigserial,jobname text,schedule text,active boolean default true);
   insert into cron.job(jobname,schedule) values('gkli-email-agenda','*/10 12-20 * * *');
   create function cron.alter_job(p_jobid bigint,schedule text) returns void language sql as $$update cron.job set schedule=$2 where jobid=$1$$;
   create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare n bigint;begin insert into cron.job(jobname,schedule) values($1,$2) returning jobid into n;return n;end$$;
   create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('gkli_email_agenda_token','test-only');
   create schema net;create table net.requests(id bigserial,url text);
   create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare n bigint;begin insert into net.requests(url) values(url) returning id into n;return n;end$$;
  `)
  await db.exec(clock(readFileSync('supabase/migrations/20261015180513_email_agenda_janela_noturna.sql','utf8')))
  const financeiro=readFileSync('scripts/validate-aceite-formalizacao.ts','utf8').split('   create function agente_virtual_negociar_acordo')[1].split('  `)')[0]
  await db.exec(clock('create function agente_virtual_negociar_acordo'+financeiro))
  for(const nome of ['20261019004657_aceite_agentes_encaminhar_humano.sql','20261019005823_avisar_operador_acordo_firmado.sql','20261019010614_aviso_operador_lidia_camila.sql','20261019012801_avisos_internos_envio_imediato.sql']) await db.exec(clock(readFileSync('supabase/migrations/'+nome,'utf8')))

  await db.exec('alter table central_pendencias add column titulo text;')
  await db.exec(clock(readFileSync('supabase/migrations/20261021123819_lidia_aviso_pedido_boletos_humano.sql','utf8')))
  await db.exec(clock(readFileSync('supabase/migrations/20261021125550_keila_aviso_pedido_boletos_humano.sql','utf8')))
  const wallet='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3',condo='2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
  await db.query('insert into carteiras(id) values($1)',[wallet])
  await db.query('insert into condominios values($1,$2,$3)',[condo,wallet,'Cádiz'])
  const payload={estado:'em_analise',emails:[{chave:'email-1',recebido_em:'2050-09-16',resumo:'Preciso do boleto do acordo.'}],atividades:[],proxima_acao:'Conferir acordo na Manager e obter boletos.'}
  await db.query('insert into central_pendencias(id,tipo,carteira_id,condominio_id,status,payload,titulo) values($1,$2,$3,$4,$5,$6,$7)',[id(900),'keila_atendimento',wallet,condo,'em_tratamento',JSON.stringify(payload),'Contato — pedido de boletos'])
  assert.equal((await db.query('select * from mensagens')).rows.length,0)
  await db.query("update central_pendencias set payload=jsonb_set(payload,'{estado}','\"atendimento_humano\"') where id=$1",[id(900)])
  const rows=await db.query<{ok:boolean,n:number,id:string,destinatario:string,payload:{email_cc:string[]},status:string,agendada_para:string}>('select * from mensagens')
  assert.equal(rows.rows.length,1); const aviso=rows.rows[0]
  assert.equal(aviso.destinatario,'danielle.lima@gekali.com.br')
  assert.deepEqual(aviso.payload.email_cc,['edi.neves@gekali.com.br'])
  assert.equal(aviso.status,'agendada')
  assert.equal((await db.query<{ok:boolean,n:number,id:string,destinatario:string,payload:{email_cc:string[]},status:string,agendada_para:string}>('select email_aviso_interno_autorizado(m) ok from mensagens m')).rows[0].ok,true)
  assert.equal(new Date(aviso.agendada_para).toISOString(),'2050-09-16T12:00:00.000Z')
  await db.query('update central_pendencias set payload=payload where id=$1',[id(900)])
  assert.equal((await db.query('select * from mensagens')).rows.length,1,'Edição não repete aviso')
  await db.query("update central_pendencias set payload=jsonb_set(payload,'{estado}','\"em_analise\"') where id=$1",[id(900)])
  await db.query("update central_pendencias set payload=jsonb_set(payload,'{estado}','\"atendimento_humano\"') where id=$1",[id(900)])
  assert.equal((await db.query('select * from mensagens')).rows.length,1,'Mesmo retorno não repete ao reabrir')
  await db.query("update central_pendencias set payload=jsonb_set(payload,'{emails}',payload->'emails'||$2::jsonb) where id=$1",[id(900),JSON.stringify([{chave:'email-2',recebido_em:'2050-09-17',resumo:'Ainda preciso do boleto'}])])
  assert.equal((await db.query('select * from mensagens')).rows.length,2,'Novo retorno gera aviso próprio')
  await db.exec("update mensagens set destinatario='morador@example.com'")
  assert.equal((await db.query<{ok:boolean,n:number,id:string,destinatario:string,payload:{email_cc:string[]},status:string,agendada_para:string}>('select count(*)::int n from mensagens m where email_aviso_interno_autorizado(m)')).rows[0].n,0,'Morador nunca autorizado como aviso interno')
  console.log('OK: encaminhamento, destinatários, agenda imediata, deduplicação, novo retorno e bloqueio de destinatário externo.')
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
