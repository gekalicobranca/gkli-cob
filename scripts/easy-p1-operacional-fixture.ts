import {readFile} from 'node:fs/promises';
import {fixtureFlow} from './easy-flow-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';
export async function fixtureOperacional(connection?:Parameters<typeof fixtureFlow>[0]){
  const db=await fixtureFlow(connection);
  await db.exec(`
    alter table condominios add column nome text default 'Condomínio sintético',add column administradora text default 'sintetica';
    create table automacao_controle(chave text primary key,ativo bool);
    create table maestro_flow_controle(carteira_id uuid primary key,ativo bool);
    create table maestro_flow_ativacoes(flow_id uuid primary key,carteira_id uuid,status text default 'pendente',erro text,updated_at timestamptz default now());
    create table agente_execucoes(id uuid primary key default gen_random_uuid(),receita_id uuid,condominio_id uuid,carteira_id uuid,solicitado_por uuid,easy_maestro_lote_id uuid,easy_maestro_montar_flow bool default false,status text,created_at timestamptz default now(),tentativas int default 0,finalizado_em timestamptz,agendado_para timestamptz,iniciado_em timestamptz);
    alter table maestro_flow_montagens add column execucao_id uuid;
    create table agente_workers(script_key text primary key,ultimo_sinal_em timestamptz);
    create table scanner_configuracoes(id uuid primary key,condominio_id uuid);
    create table easy_pague_consultas(id uuid primary key,carteira_id uuid,configuracao_id uuid,estado text,tentativas int default 0,criado_em timestamptz default now());
    insert into agente_administradoras(id,ativo) values('${id(9)}',true);
    insert into agente_receitas(id,administradora_id,ativo,script_key,config_json) values('${id(8)}','${id(9)}',true,'worker_sintetico','{"condominio_id":"${id(2)}"}');
    insert into maestro_flow_controle values('${id(1)}',false);
    insert into automacao_controle values('captacao_global',true);
    create function easy_maestro_receitas(p_carteiras uuid[],p_administradora text)
    returns table(receita_id uuid,condominio_id uuid,carteira_id uuid,condominio_nome text) language sql as $$
      select r.id,c.id,c.carteira_id,c.nome from public.agente_receitas r join public.condominios c on r.config_json->>'condominio_id'=c.id::text
        where r.ativo and c.status='ativo' and (p_carteiras is null or c.carteira_id=any(p_carteiras)) and (p_administradora is null or p_administradora='sintetica')$$;
    create function easy_maestro_captar(p_carteiras uuid[],p_administradora text,p_usuario uuid,p_lote uuid,p_montar_flow boolean,p_condominios uuid[])
    returns integer language plpgsql as $$
    declare n int;
    begin
      insert into public.agente_execucoes(receita_id,condominio_id,carteira_id,solicitado_por,easy_maestro_lote_id,easy_maestro_montar_flow,status)
        select r.receita_id,r.condominio_id,r.carteira_id,p_usuario,p_lote,p_montar_flow,'pendente' from public.easy_maestro_receitas(p_carteiras,p_administradora) r where r.condominio_id=any(p_condominios);
      get diagnostics n=row_count;return n;
    end $$;
    create function maestro_flow_lote(p_job uuid,p_token uuid) returns uuid language plpgsql as $$
    begin
      return p_job;
    end $$;
    create function maestro_flow_finalizar(p_job uuid,p_token uuid,p_nome text) returns uuid language plpgsql as $$
    begin
      return p_job;
    end $$;
    create function maestro_flow_ativar(p_flow uuid,p_remetente text) returns text language plpgsql as $$
    begin
      update public.maestro_flow_ativacoes set status='ativado' where flow_id=p_flow;
      return 'ativado';
    end $$;
    create function maestro_flow_enfileirar_ativacao() returns trigger language plpgsql as $$begin return new;end$$;
    create trigger maestro_flow_ativacao_novo after insert on cobranca_flows for each row execute function maestro_flow_enfileirar_ativacao();
  `);
  for(const name of ['20261119205321_easy_maestro_consentimento.sql','20261119205324_easy_recuperacao_administrativa.sql','20261119205728_easy_saude_workers.sql'])await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
  await db.exec('grant select,insert,update,delete on automacao_controle,maestro_flow_controle,maestro_flow_ativacoes,agente_execucoes,agente_workers,scanner_configuracoes,easy_pague_consultas to service_role');
  const conferir=async(montar=true)=>(await db.query<{e:any}>('select easy_maestro_efeitos($1,$2,$3,$4) e',[id(10),'sintetica',[id(2)],montar])).rows[0].e;
  const solicitar=async(e:any,lote=id(80),montar=true)=>(await db.query<{n:number}>('select easy_maestro_captar_confirmado($1,$2,$3,$4,$5,$6,$7) n',[id(10),'sintetica',lote,montar,[id(2)],e.versao,e.ativacaoAutomatica])).rows[0].n;
  return {db,conferir,solicitar};
}
