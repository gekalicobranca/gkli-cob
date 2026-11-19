import {readFile} from 'node:fs/promises';
import {fixtureCap,inserirCobranca} from './easy-cap-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';

export const migrationCancelamento='supabase/migrations/20261119204222_acordo_cancelamento_transacional.sql';
export async function fixtureCancelamento(connection?:Parameters<typeof fixtureCap>[0]){
  const db=await fixtureCap(connection);
  await db.exec(`
    alter table acordos add column status_financeiro text default 'em_aberto',add column fluxo_status text,add column data_quitacao date;
    create table acordos_termos(id uuid primary key,acordo_id uuid references acordos,carteira_id uuid,status text,tipo_aceite text,updated_at timestamptz default now());
    create table parcelas_acordo(id uuid primary key,acordo_id uuid references acordos,status text,data_pagamento date,valor_pago numeric,valor numeric);
    alter table mensagens add column acordo_id uuid,add column acordo_flow_id uuid,add column sent_at timestamptz,add column enviada_em timestamptz;
    create table acordo_flows(id uuid primary key,status text,total_pendentes int,total_agendadas int);
    create table central_pendencias(id uuid primary key,acordo_id uuid,status text);
    create or replace function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function current_user_can_access_carteira(p_carteira uuid) returns boolean language sql as $$
      select exists(select 1 from public.profiles p where p.id=auth.uid() and (p.role='admin' or exists(select 1 from public.usuarios_carteiras u where u.user_id=p.id and u.carteira_id=p_carteira)))$$;
  `);
  await db.exec(await readFile('supabase/migrations/20261116152754_acordo_documentos.sql','utf8'));
  await db.exec(await readFile(migrationCancelamento,'utf8'));
  await db.exec('grant select,insert,update,delete on acordos_termos,parcelas_acordo,acordo_flows,central_pendencias to service_role');
  await inserirCobranca(db,30);await db.query("update cobrancas set status='acordo_firmado',status_operacional='acordo_firmado' where id=$1",[id(30)]);
  await db.query("insert into acordos(id,carteira_id,condominio_id,unidade_id,cobranca_id,status,fluxo_status) values($1,$2,$3,$4,$5,'ativo','aguardando_aceite_devedor')",[id(40),id(1),id(2),id(3),id(30)]);
  await db.query('insert into acordo_cobrancas values($1,$2)',[id(40),id(30)]);
  await db.query("insert into acordos_termos(id,acordo_id,carteira_id,status) values($1,$2,$3,'pendente'),($4,$2,$3,'aceito')",[id(41),id(40),id(1),id(42)]);
  await db.query("insert into parcelas_acordo values($1,$2,'aberta',null,null,100),($3,$2,'pendente',null,null,100),($4,$2,'vencida',null,null,100)",[id(50),id(40),id(51),id(52)]);
  await db.query("insert into acordo_flows values($1,'em_execucao',0,1)",[id(60)]);
  await db.query("insert into mensagens(id,carteira_id,acordo_id,acordo_flow_id,status,status_operacional,scheduled_at,agendada_para) values($1,$2,$3,$4,'agendada','agendada',now(),now())",[id(61),id(1),id(40),id(60)]);
  await db.query('insert into email_agenda values($1)',[id(61)]);
  await db.query("insert into central_pendencias values($1,$2,'pendente')",[id(62),id(40)]);
  const cancelar=(options:{operacao?:string;operador?:string;motivo?:string;pdf?:string|null}={})=>db.query<{r:any}>('select acordo_cancelar_formalizacao_atomico($1,$2,$3,$4,$5,$6,$7) r',[
    options.operacao??id(70),id(40),options.operador??id(10),options.motivo??'Motivo sintético','',options.pdf===undefined?Buffer.from('%PDF-sintetico').toString('base64'):options.pdf,options.pdf===null?null:'debito.pdf']);
  const resultado=(operador=id(10))=>db.query<{r:any}>('select acordo_cancelamento_resultado($1,$2,$3) r',[id(70),id(40),operador]);
  return {db,cancelar,resultado};
}
