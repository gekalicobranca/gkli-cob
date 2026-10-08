import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function main() {
  const db = new PGlite()
  try {
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
    await db.exec(readFileSync('supabase/migrations/20261008161105_importacao_substituir_novo_e_ativa.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261008181542_importacao_preservar_historico_whatsapp.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261008203444_importacao_substituir_regular.sql', 'utf8'))
    const run = async () => (await db.query<{ result: any }>('select importacao_substituir_cobrancas_anteriores($1) result', [id(1)])).rows[0].result
    await db.exec("begin; savepoint year_scope; update importacoes set resumo=jsonb_set(resumo,'{somente_ano_corrente}','true')")
    assert.deepEqual((await run()).ids.sort(), [id(10), id(12), id(14)])
    await db.exec('rollback to savepoint year_scope; release savepoint year_scope; commit')
    await db.exec('alter table auditoria_eventos add constraint audit_failure check(false)')
    await assert.rejects(run(), /audit_failure/)
    assert.equal((await db.query('select * from cobrancas')).rows.length, 8)
    assert.equal((await db.query<any>('select status from mensagens')).rows[0].status, 'agendada')
    await db.exec('alter table auditoria_eventos drop constraint audit_failure')
    await db.exec("update importacoes set total_invalidas=1,total_linhas=2,resumo=jsonb_set(resumo,'{recorte_regua}','\"parcial\"')")
    const result = await run()
    assert.equal(result.removidas, 5)
    assert.deepEqual(result.ids.sort(), [id(10), id(11), id(12), id(14), id(17)])
    assert.equal(result.mensagens_canceladas, 1)
    assert.equal(result.itens_removidos, 1)
    const message = (await db.query<any>('select * from mensagens')).rows[0]
    assert.equal(message.status, 'cancelada')
    assert.equal(message.cobranca_id, null)
    assert.equal((await db.query<any>('select mensagem_id from whatsapp_web_envios')).rows[0].mensagem_id, id(41))
    assert.deepEqual(message.payload.cobranca_ids, [])
    assert.equal((await db.query<any>('select status from cobranca_flows')).rows[0].status, 'cancelado')
    assert.equal((await db.query<any>('select status from flow_progressao')).rows[0].status, 'cancelado')
    assert.equal((await db.query('select * from lote_itens')).rows.length, 0)
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 1)
    assert.equal((await run()).removidas, 0)
    console.log('OK: substitui Novo/ativa presentes ou ausentes em relatórios parciais/inválidos; respeita o ano; preserva acordos e outros condomínios; cancela flows, audita e reverte tudo se falhar.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
