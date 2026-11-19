import {readFile} from 'node:fs/promises';
import {fixtureCap,inserirCobranca} from './easy-cap-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';

export const migrationFlow='supabase/migrations/20261118220528_easy_flow_transacional.sql';
/** Somente Postgres WASM em memória, dados sintéticos, sem env/rede/providers. */
export async function fixtureFlow(connection?:Parameters<typeof fixtureCap>[0]){
  const db=await fixtureCap(connection);
  await db.exec(`
    drop table easy_flow_execucoes;
    alter table condominios add column vencimento_cota_dia integer;
    create table reguas(id uuid primary key,carteira_id uuid,tipo text,nome text,ativo bool,status text);
    create table regua_etapas(id uuid primary key,regua_id uuid,canal text,ativo bool,delay_dias int,ordem int);
    create table integracoes_smtp_config(id uuid primary key,carteira_id uuid,ativo bool);
    create table integracoes_smtp_rotas_condominio(condominio_id uuid,carteira_id uuid,smtp_config_id uuid,ativo bool);
    create table mensagens_templates(id uuid primary key,conteudo text);
    create table regua_compliance_regras(id uuid primary key);
    create table regua_destinatarios_bloqueados(id uuid primary key);
    create table regua_pausas(id uuid primary key);
    create table responsaveis_unidades(id uuid primary key,condominio_id uuid);
    alter table flow_progressao add column carteira_id uuid;
    create table lotes(id uuid primary key,carteira_id uuid,regua_id uuid,tipo text,status text,operador_id uuid,iniciado_em timestamptz,
      total_avaliadas int,total_criadas int,total_pendentes int,resumo jsonb,aprovado_por uuid,aprovado_em timestamptz);
    alter table mensagens add column contexto text,add column canal text,add column destinatario text,
      add column conteudo text,add column conteudo_renderizado text,add column lote_id uuid,
      add column regua_etapa_id uuid,add column template_id uuid,add column fingerprint text unique,
      add column enviado_em timestamptz,add column enviada_em timestamptz,add column enviada_manual_em timestamptz,add column aprovado_por uuid,add column aprovado_em timestamptz,
      add column created_at timestamptz default now();
    alter table lote_itens alter column id set default gen_random_uuid();
    alter table lote_itens add primary key(id);
    alter table lote_itens add column lote_id uuid,add column unidade_id uuid,add column condominio_id uuid,
      add column regua_etapa_id uuid,add column mensagem_id uuid,add column status text,add column fingerprint text,
      add column payload jsonb,add column motivo text,add column aprovado_em timestamptz;
    alter table cobranca_flows add column carteira_id uuid,add column lote_id uuid unique references lotes,
      add column regua_id uuid,add column nome text,add column pausado_em timestamptz,add column iniciado_em timestamptz,
      add column total_mensagens int,add column criado_por uuid,add column atualizado_por uuid,add column payload jsonb;
    create function email_reservar_horario(p_id uuid,p_remetente text) returns timestamptz language plpgsql as $$
    begin
      insert into email_agenda(mensagem_id) values(p_id);
      update mensagens set status='agendada',scheduled_at=now(),agendada_para=now() where id=p_id;
      return now();
    end $$;
    insert into reguas values('${id(4)}','${id(1)}','cobranca','Régua sintética',true,'ativa');
    insert into regua_etapas values('${id(5)}','${id(4)}','email',true,0,1);
    insert into integracoes_smtp_config values('${id(6)}','${id(1)}',true);
  `);
  const original=await readFile('supabase/migrations/20261108142307_easy_flow_smtp.sql','utf8');
  await db.exec(original.slice(0,original.indexOf('-- Preserva a implementação instalada'))+'\ncommit;');
  await db.exec(await readFile('supabase/migrations/20261118205314_easy_p0_contencao.sql','utf8'));
  // Ativador real; apenas o calendário externo é substituído pelo stub acima.
  const agenda=await readFile('supabase/migrations/20260916170000_agenda_email_carteira.sql','utf8');
  const inicio=agenda.indexOf('create function public.email_ativar_flow(');
  await db.exec(agenda.slice(inicio,agenda.indexOf('create function public.email_reservar_disparo',inicio)));
  // Permissões operacionais do schema sintético; as tabelas novas da migration
  // seguinte mantêm exclusivamente os grants definidos na própria migration.
  await db.exec(`grant select,insert,update,delete on reguas,regua_etapas,integracoes_smtp_config,
    integracoes_smtp_rotas_condominio,mensagens_templates,regua_compliance_regras,
    regua_destinatarios_bloqueados,regua_pausas,responsaveis_unidades,lotes to service_role;`);
  await db.exec(await readFile(migrationFlow,'utf8'));
  await inserirCobranca(db,30);
  return db;
}
export async function iniciarFlow(db:Awaited<ReturnType<typeof fixtureFlow>>,partes=[[id(30)]]){
  const snapshot=(await db.query<{s:string}>('select easy_flow_snapshot($1,$2) s',[id(2),id(4)])).rows[0].s;
  const iniciar=()=>db.query<{r:any}>('select to_jsonb(easy_flow_iniciar($1,$2,$3,$4,$5,$6,$7,$8,$9)) r',
    [id(10),id(2),id(4),id(6),JSON.stringify(partes),'{}','config',JSON.stringify({canais:['email']}),snapshot]);
  const run=(await iniciar()).rows[0].r;
  const manifesto=(ids=partes[0])=>({mensagens:[{cobranca_ids:ids,etapa_id:id(5),canal:'email',destinatario:'sintetico@example.invalid',conteudo:'Conteúdo sintético',template_id:null,payload:{}}]});
  const montar=(indice=0,m=manifesto(partes[indice]))=>db.query<{r:any}>('select to_jsonb(easy_flow_montar($1,$2,$3,$4)) r',[run.id,indice,id(10),JSON.stringify(m)]);
  const liberar=(indice=0)=>db.query<{n:number}>('select easy_flow_liberar($1,$2,$3,$4) n',[run.id,indice,id(10),'sintetico']);
  const reconciliar=()=>db.query<{r:any}>('select to_jsonb(easy_flow_reconciliar($1,$2)) r',[run.id,id(10)]);
  return {run,iniciar,manifesto,montar,liberar,reconciliar};
}
