import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {fixtureId as id} from './easy-p0-fixture';
import {prepararPlanoCaptacao,hashPlanoCaptacao} from '../features/easy-cob/captacao-plano';
import {gerarAssinaturaCaptacao} from '../features/easy-cob/captacao-assinatura';
import type {ConversaoPreview} from '../features/conversao-relatorio/server/parse-relatorio-buffer';

export const migrationCap='supabase/migrations/20261118211109_easy_cap_commit_transacional.sql';
export async function fixtureCap(db=new PGlite()) {
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    grant usage on schema auth to service_role;
    create table carteiras(id uuid primary key);
    create table profiles(id uuid primary key,role text);
    create table usuarios_carteiras(user_id uuid,carteira_id uuid);
    create table condominios(id uuid primary key,carteira_id uuid,cnpj text,status text,inicio_cobranca_dias int default 30,dias_apos_vencimento_regua int,
      bloqueio_garantidora_habilitado bool default false,bloqueio_garantidora_inicio date,bloqueio_garantidora_fim date);
    create table unidades(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid references condominios,
      identificacao text not null,bloco text,responsavel_nome text,email text,telefone text,acao_judicial bool default false,status text default 'ativa',updated_at timestamptz default now());
    create unique index unidade_literal on unidades(condominio_id,identificacao,coalesce(bloco,''));
    create table conversoes_relatorio(id uuid primary key,carteira_id uuid,condominio_id uuid,origem text,status text,nome_arquivo text,
      total_cobrancas integer,valor_total numeric,preview_json jsonb,inconsistencias_json jsonb,limpeza_maestro_em timestamptz,atualizado_em timestamptz default now());
    create table cobrancas(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid references condominios,unidade_id uuid references unidades,
      competencia text,valor_original numeric not null,valor_atualizado numeric not null,multa numeric default 0,juros numeric default 0,correcao numeric default 0,
      vencimento date not null,status text,status_operacional text,status_financeiro text default 'em_aberto',automacao_bloqueada bool default false,
      observacoes text,origem_importacao text,conversao_relatorio_id uuid references conversoes_relatorio,updated_at timestamptz default now(),
      data_pagamento date,valor_pago numeric default 0,duplicada_de_id uuid references cobrancas);
    create table cobranca_parcelas(id uuid primary key default gen_random_uuid(),cobranca_id uuid references cobrancas,conversao_relatorio_id uuid references conversoes_relatorio,
      data_vencimento date,referencia text,valor_original numeric,valor_atualizado numeric,status text,origem_linha_json jsonb,data_pagamento date);
    create table acordos(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,cobranca_id uuid references cobrancas,status text);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid references cobrancas);
    create table scanner_baixas(id uuid default gen_random_uuid(),cobranca_id uuid references cobrancas);
    create table mensagens(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid references cobrancas,cobranca_flow_id uuid,
      payload jsonb default '{}',status text,status_operacional text,cancelado_em timestamptz,cancelada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,motivo_cancelamento text);
    create table email_tentativas(mensagem_id uuid,estado text);
    create table whatsapp_web_envios(mensagem_id uuid,estado text);
    create table email_agenda(mensagem_id uuid);
    create table flow_progressao(cobranca_ids uuid[],status text,token uuid,lease_ate timestamptz,erro text,updated_at timestamptz);
    create table cobranca_flows(id uuid primary key,status text,total_pendentes int,total_agendadas int,total_falhas int,proximo_disparo_em timestamptz);
    create table lote_itens(id uuid,cobranca_id uuid,cobranca_flow_id uuid);
    create table easy_flow_execucoes(id uuid primary key,condominio_id uuid,status text);
    create table maestro_flow_montagens(id uuid primary key,condominio_id uuid,status text);
    create table agente_administradoras(id uuid primary key,ativo bool);
    create table agente_receitas(id uuid primary key,administradora_id uuid,ativo bool,script_key text,config_json jsonb);
    create table importacoes(id uuid primary key);
    create table timeline_operacional(id uuid default gen_random_uuid(),carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,
      usuario_id uuid,origem text,payload jsonb);
    create table auditoria_eventos(id uuid default gen_random_uuid(),carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,
      descricao text,usuario_id uuid,usuario_nome text,antes jsonb,depois jsonb,diferencas jsonb);
    insert into carteiras values('${id(1)}'),('${id(99)}');
    insert into profiles values('${id(10)}','operador'),('${id(11)}','admin'),('${id(12)}','leitura');
    insert into usuarios_carteiras values('${id(10)}','${id(1)}');
    insert into condominios(id,carteira_id,cnpj,status) values('${id(2)}','${id(1)}','00000000000000','ativo');
    insert into unidades(id,carteira_id,condominio_id,identificacao,responsavel_nome,email)
      values('${id(3)}','${id(1)}','${id(2)}','101','Responsável preservado','preservado@example.invalid');
  `);
  const saneamento=await readFile('supabase/sql/2026-06-02_saneamento_cobrancas.sql','utf8');
  await db.exec(saneamento.slice(0,saneamento.indexOf('create index')));
  const historico=await readFile('supabase/migrations/20260907190000_captacao_historica_sindico.sql','utf8');
  await db.exec(historico.slice(0,historico.indexOf('create index')));
  // Triggers reais de inventário e de proteção/auditoria do arquivo operacional.
  await db.exec(await readFile('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261103194949_cobrancas_arquivamento_operacional.sql','utf8'));
  await db.exec(await readFile(migrationCap,'utf8'));
  // Grants operacionais sintéticos; receipt e inventário mantêm grants da migration.
  const tables=(await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public' and tablename not in ('cobrancas_recibo_guard','easy_captacao_resultados')")).rows;
  for(const t of tables)await db.exec(`grant select,insert,update,delete on public.${t.tablename} to service_role`);
  return db;
}

export function previewCap(ano:number):ConversaoPreview {
  return {tipoConversao:'cobrancas',origem:'Fixture sintética',arquivo:'fixture.csv',totalParcelas:0,valorTotal:150,padraoDetectado:null,
    cobrancas:[{unidade:'101',responsavel:'Responsável do relatório',email:'novo@example.invalid',telefone:'11999999999',recibo:'123',
      vencimento:`01/01/${ano}`,vencimentoMaisAntigo:`01/01/${ano}`,valorPrincipal:140,juros:10,valorTotal:150,parcelas:[]}],
    unidades:[],inconsistencias:[],csv:'',xlsxBase64:''};
}

export async function prepararConversao(db:PGlite,n=20,source?:ConversaoPreview) {
  const ano=(await db.query<{ano:number}>("select extract(year from now() at time zone 'America/Sao_Paulo')::int ano")).rows[0].ano;
  const preview=source??previewCap(ano),plano=prepararPlanoCaptacao(preview),planoHash=hashPlanoCaptacao(plano);
  const snapshot=(await db.query<{snapshot:unknown}>('select easy_captacao_snapshot($1,$2) snapshot',[id(2),id(1)])).rows[0].snapshot;
  const full={...preview,easyCaptacao:{operadorId:id(10),arquivoSha256:'arquivo-sintetico',substituicao:snapshot,plano,planoHash,assinatura:''}};
  full.easyCaptacao.assinatura=gerarAssinaturaCaptacao('segredo-exclusivo-da-fixture',id(n),id(2),id(1),full);
  await db.query('insert into conversoes_relatorio(id,carteira_id,condominio_id,origem,status,nome_arquivo,total_cobrancas,valor_total,preview_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id(n),id(1),id(2),'easy_captacao','preview',preview.arquivo,plano.quantidade,preview.valorTotal,full]);
  const confirmar=async(operador=id(10))=>db.query<{resultado:any}>('select easy_captacao_confirmar($1,$2,$3,$4) resultado',
    [id(n),operador,full.easyCaptacao.assinatura,planoHash]);
  return {confirmar,full,ano,id:id(n)};
}

export async function inserirCobranca(db:PGlite,n:number,recibo='123',extra='') {
  return db.query(`insert into cobrancas(id,carteira_id,condominio_id,unidade_id,valor_original,valor_atualizado,vencimento,status,status_operacional,observacoes)
    values($1,$2,$3,$4,100,100,date_trunc('year',now())::date,'novo','novo',$5) ${extra}`, [id(n),id(1),id(2),id(3),`Recibo ${recibo}`]);
}
