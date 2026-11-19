import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

export const migrationP0 = 'supabase/migrations/20261118205314_easy_p0_contencao.sql';
export const fixtureId=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

/** Postgres WASM em memória. Não usa env, rede, Supabase linked ou dados reais. */
export async function fixtureEasyP0() {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table carteiras(id uuid primary key);
    create table condominios(id uuid primary key);
    create table reguas(id uuid primary key);
    create table integracoes_smtp_config(id uuid primary key);
    insert into carteiras values('${fixtureId(1)}');
    insert into condominios values('${fixtureId(2)}'),('${fixtureId(3)}');
    insert into reguas values('${fixtureId(4)}');
    create table financial_probe(id integer primary key, valor numeric);
    insert into financial_probe values(1,123.45);
    create function easy_preparar_captacao(uuid,text) returns jsonb language plpgsql as $$
    begin delete from financial_probe; return '{}'::jsonb; end $$;
  `);
  // Mesma estrutura/constraint/index originais, sem as dependências SMTP alheias à contenção.
  const original=await readFile('supabase/migrations/20261108142307_easy_flow_smtp.sql','utf8');
  await db.exec(original.slice(0,original.indexOf('-- Preserva a implementação instalada'))+'\ncommit;');
  return db;
}

export async function inserirExecucao(db:PGlite,n:number,status='preview',condominio=2) {
  return db.query(`insert into easy_flow_execucoes
    (id,condominio_id,carteira_id,criado_por,regua_id,status,plano,versoes,config_version,resumo)
    values($1,$2,$3,$4,$5,$6,'[]','{}','v1','{}') returning id`,
    [fixtureId(n),fixtureId(condominio),fixtureId(1),fixtureId(5),fixtureId(4),status]);
}
