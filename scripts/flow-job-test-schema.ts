import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'

export async function applyFlowJobProtection(db: PGlite) {
  await db.exec(`
    alter role service_role bypassrls;
    create table automacao_controle(chave text primary key,ativo boolean);
    create table maestro_flow_montagens(status text,lease_ate timestamptz);
    create table maestro_flow_controle(carteira_id uuid,ativo boolean);
    create table maestro_flow_ativacoes(carteira_id uuid,status text);
    create function maestro_flow_claim() returns void language sql as $$ select $$;
    create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
    insert into vault.decrypted_secrets values('gkli_email_agenda_token','test');
    create schema net; create table net.requests(id bigserial,url text);
    create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text);
    create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      declare r bigint; begin insert into net.requests(url) values(url) returning id into r; return r; end $$;
    create schema cron; create table cron.job(jobid bigint,jobname text,active boolean);
    insert into cron.job values(2,'gkli-maestro-flows',true),(3,'gkli-flow-progressao',true);
    create function cron.alter_job(jobid bigint,active boolean) returns void language sql as $$
      update cron.job j set active=$2 where j.jobid=$1 $$;
  `)
  await db.exec(readFileSync('supabase/migrations/20261002021211_flows_jobs_protecao_carga.sql', 'utf8'))
}
