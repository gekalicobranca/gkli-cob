import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
async function main(){const db=new PGlite();try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table importacoes(id uuid primary key,tipo text,total_invalidas int,total_linhas int,resumo jsonb,carteira_id uuid,status text);
      create table importacao_itens(importacao_id uuid,valido boolean,payload jsonb);
      create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,vencimento date,duplicada_de_id uuid,status_operacional text,status_financeiro text);
      create table acordos(id uuid,cobranca_id uuid references cobrancas);
      create table acordo_cobrancas(id uuid,cobranca_id uuid references cobrancas);
      create table cobranca_flows(id uuid primary key,payload jsonb,status text,cancelado_em timestamptz,total_mensagens int,total_pendentes int,total_agendadas int,total_enviadas int,total_falhas int,proximo_disparo_em timestamptz);
      create table mensagens(id uuid primary key,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid,payload jsonb,status text,status_operacional text,cancelado_em timestamptz,cancelada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,motivo_cancelamento text);
      create table whatsapp_web_envios(mensagem_id uuid not null references mensagens(id),estado text);
      create table lote_itens(id uuid,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid);
      create table flow_progressao(cobranca_ids uuid[],status text,token text,lease_ate timestamptz,erro text,updated_at timestamptz);
      create table maestro_flow_montagens(plano jsonb,status text,token text,lease_ate timestamptz,updated_at timestamptz);
      create table central_pendencias(cobranca_id uuid references cobrancas on delete set null,entidade_tipo text,entidade_id uuid,status text,resolvido_em timestamptz,payload jsonb);
      create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
      insert into importacoes values('${id(1)}','cobrancas',0,1,'{"recorte_regua":"todos","somente_ano_corrente":false}','${id(2)}','preview');
      insert into importacao_itens values('${id(1)}',true,'{"condominio_id":"${id(3)}","carteira_id":"${id(2)}","unidade_id":"${id(4)}","vencimento":"2026-10-05"}');
      insert into cobrancas values
        ('${id(10)}','${id(3)}','${id(2)}','${id(4)}','2026-10-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(11)}','${id(3)}','${id(2)}','${id(4)}','2025-10-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(12)}','${id(3)}','${id(2)}','${id(4)}','2026-09-05',null,'novo','em_aberto'),
        ('${id(13)}','${id(3)}','${id(2)}','${id(4)}','2026-08-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(14)}','${id(3)}','${id(2)}','${id(4)}','2026-07-05',null,'em_cobranca_ativa','quitado'),
        ('${id(15)}','${id(30)}','${id(2)}','${id(4)}','2026-06-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(16)}','${id(3)}','${id(2)}','${id(4)}','2026-05-05',null,'novo','em_aberto'),
        ('${id(17)}','${id(3)}','${id(2)}','${id(4)}','2025-05-05',null,'regular','em_aberto');
      insert into acordos values('${id(20)}','${id(13)}');
      insert into acordo_cobrancas values('${id(21)}','${id(16)}');
      insert into cobranca_flows(id,payload,status) values('${id(40)}','{"cobranca_ids":["${id(11)}"]}','ativo');
      insert into mensagens(id,cobranca_id,cobranca_flow_id,payload,status,status_operacional,agendada_para) values('${id(41)}','${id(11)}','${id(40)}','{"cobranca_ids":["${id(11)}"]}','agendada','agendada',now());
      insert into whatsapp_web_envios values('${id(41)}','reservado');
      insert into lote_itens values('${id(42)}','${id(11)}','${id(40)}');
      insert into flow_progressao(cobranca_ids,status) values(array['${id(11)}'::uuid],'pendente');
      insert into maestro_flow_montagens(plano,status) values('[["${id(11)}"]]','processando');
    `)

await db.exec(`create table unidades(id uuid primary key,bloco text); create table conversoes_relatorio(id uuid primary key,carteira_id uuid,condominio_id uuid,status text,preview_json jsonb);`)
await db.exec(readFileSync('supabase/migrations/20261016182723_living_subcondominio_escopo.sql','utf8'))
const living='cb988811-e0ea-45d6-990b-6476271eb109';
await db.query("insert into conversoes_relatorio(id,carteira_id,condominio_id,status,preview_json) values($1,$2,$3,'preview','{}')",[id(80),id(2),living]);
await assert.rejects(db.query('select maestro_substituir_cobrancas_conversao($1)',[id(80)]),/exige escopo/)
await db.exec(`insert into unidades values('${id(84)}','A'),('${id(85)}','C'); insert into cobrancas(id,condominio_id,carteira_id,unidade_id,vencimento,status_operacional) values('${id(81)}','${living}','${id(2)}','${id(84)}','2026-07-10','novo'),('${id(82)}','${living}','${id(2)}','${id(85)}','2026-07-10','novo'),('${id(83)}','${living}','${id(2)}','${id(85)}','2025-07-10','novo');`)
await db.query(`update conversoes_relatorio set preview_json='{"escopoBlocosMaestro":[]}' where id=$1`,[id(80)]);
assert.equal((await db.query<any>('select maestro_substituir_cobrancas_conversao($1) as r',[id(80)])).rows[0].r.removidas,0)
await db.query(`update conversoes_relatorio set limpeza_maestro_em=null,preview_json='{"escopoBlocosMaestro":["A"]}' where id=$1`,[id(80)]);
assert.deepEqual((await db.query<any>('select maestro_substituir_cobrancas_conversao($1) as r',[id(80)])).rows[0].r.ids,[id(81)])
assert.equal((await db.query('select id from cobrancas where id in ($1,$2)',[id(82),id(83)])).rows.length,2)
console.log('OK: Central vazio preserva C; coleta de A substitui só A; anos anteriores preservados; escopo ausente bloqueado.')
}finally{await db.close()}}main().catch(e=>{console.error(e);process.exitCode=1})
