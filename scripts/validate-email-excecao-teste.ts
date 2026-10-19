import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

async function main(){
 const db=new PGlite()
 try{
  const schema=readFileSync('scripts/validate-email-agenda.ts','utf8').split('await db.exec(`')[1].split('`)')[0]
  await db.exec(schema)
  await db.exec(`
   alter table mensagens add column cobranca_id uuid,add column acordo_id uuid,add column destinatario text,add column email_assunto text,add column template_id uuid;
   create table condominios(id uuid primary key,carteira_id uuid);
   create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid);
   create function email_aviso_interno_autorizado(m mensagens) returns boolean language sql as $$select false$$;
   create function email_reservar_disparo_interno(uuid,text) returns boolean language plpgsql as $$declare m mensagens;begin
    select * into m from mensagens where id=$1;
    return public.email_aviso_interno_autorizado(m) is not true
      and public.email_aviso_interno_autorizado(m) is not true
      and public.email_aviso_interno_autorizado(m) is not true;
   end$$;
  `)
  await db.exec(readFileSync('supabase/migrations/20261019205138_email_excecao_teste_restrita.sql','utf8'))
  const u=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  await db.query('insert into carteiras(id) values($1)',[u(1)])
  await db.query('insert into condominios values($1,$2)',[u(2),u(1)])
  await db.query('insert into cobrancas values($1,$2,$3)',[u(3),u(2),u(1)])
  await db.query('insert into cobranca_flows(id) values($1)',[u(4)])
  for(const n of [5,6])await db.query("insert into mensagens(id,carteira_id,cobranca_id,cobranca_flow_id,status,conteudo,destinatario) values($1,$2,$3,$4,'agendada','Teste','teste@example.com')",[u(n),u(1),u(3),u(4)])
  const ok=async(n=5)=>(await db.query<{ok:boolean}>('select email_excecao_teste_autorizada(m) ok from mensagens m where id=$1',[u(n)])).rows[0].ok
  assert.equal(await ok(),false)
  await db.query("insert into email_excecoes_teste select id,carteira_id,$2,cobranca_flow_id,email_assinatura_teste(m),'teste autorizado',now(),now()+interval '1 hour',null from mensagens m where id=$1",[u(5),u(2)])
  assert.equal(await ok(),true);assert.equal(await ok(6),false)
  for(const mutation of ["destinatario='outro@example.com'","conteudo='Alterado'","status='enviada'"]){
   await db.exec('begin');await db.exec(`update mensagens set ${mutation} where id='${u(5)}'`);assert.equal(await ok(),false);await db.exec('rollback')
  }
  await db.exec("update email_excecoes_teste set expira_em=now()-interval '1 second',criado_em=now()-interval '1 hour'")
  assert.equal(await ok(),false)
  await db.exec("update email_excecoes_teste set expira_em=now()+interval '30 minutes',criado_em=now(),revogado_em=now()")
  assert.equal(await ok(),false)
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`)
   await assert.rejects(db.query('select * from email_excecoes_teste'))
   await db.exec('reset role')
  }
  console.log('OK: escopo, conteúdo, estado, expiração, revogação e acesso restrito.')
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
