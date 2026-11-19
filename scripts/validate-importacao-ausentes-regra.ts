import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { removerCobrancasAusentesDaImportacao } from '../features/importacoes/remover-ausentes'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table importacoes(id uuid primary key,tipo text,total_invalidas int,total_linhas int,resumo jsonb,carteira_id uuid);
      create table importacao_itens(importacao_id uuid,valido boolean,payload jsonb);
      create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,vencimento date,duplicada_de_id uuid,status_operacional text,status_financeiro text);
      create table acordos(id uuid,cobranca_id uuid references cobrancas);
      create table acordo_cobrancas(id uuid,cobranca_id uuid references cobrancas);
      create table cobranca_flows(id uuid primary key,payload jsonb,status text,cancelado_em timestamptz,total_mensagens int,total_pendentes int,total_agendadas int,total_enviadas int,total_falhas int,proximo_disparo_em timestamptz);
      create table mensagens(id uuid primary key,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid,payload jsonb,status text,status_operacional text,cancelado_em timestamptz,cancelada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,motivo_cancelamento text);
      create table lote_itens(id uuid,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid);
      create table flow_progressao(cobranca_ids uuid[],status text,token text,lease_ate timestamptz,erro text,updated_at timestamptz);
      create table maestro_flow_montagens(plano jsonb,status text,token text,lease_ate timestamptz,updated_at timestamptz);
      create table central_pendencias(cobranca_id uuid references cobrancas on delete set null,entidade_tipo text,entidade_id uuid,status text,resolvido_em timestamptz,payload jsonb);
      create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
      insert into importacoes values('${id(1)}','cobrancas',0,1,'{"recorte_regua":"todos","somente_ano_corrente":false}','${id(2)}');
      insert into importacao_itens values('${id(1)}',true,'{"condominio_id":"${id(3)}","carteira_id":"${id(2)}","unidade_id":"${id(4)}","vencimento":"2026-10-05"}');
      insert into cobrancas values
        ('${id(10)}','${id(3)}','${id(2)}','${id(4)}','2026-10-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(11)}','${id(3)}','${id(2)}','${id(4)}','2025-10-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(12)}','${id(3)}','${id(2)}','${id(4)}','2026-09-05',null,'novo','em_aberto'),
        ('${id(13)}','${id(3)}','${id(2)}','${id(4)}','2026-08-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(14)}','${id(3)}','${id(2)}','${id(4)}','2026-07-05',null,'em_cobranca_ativa','quitado'),
        ('${id(15)}','${id(30)}','${id(2)}','${id(4)}','2026-06-05',null,'em_cobranca_ativa','em_aberto'),
        ('${id(16)}','${id(3)}','${id(2)}','${id(4)}','2026-05-05',null,'novo','em_aberto');
      insert into acordos values('${id(20)}','${id(13)}');
      insert into acordo_cobrancas values('${id(21)}','${id(16)}');
      insert into cobranca_flows(id,payload,status) values('${id(40)}','{"cobranca_ids":["${id(11)}"]}','ativo');
      insert into mensagens(id,cobranca_id,cobranca_flow_id,payload,status,status_operacional,agendada_para) values('${id(41)}','${id(11)}','${id(40)}','{"cobranca_ids":["${id(11)}"]}','agendada','agendada',now());
      insert into lote_itens values('${id(42)}','${id(11)}','${id(40)}');
      insert into flow_progressao(cobranca_ids,status) values(array['${id(11)}'::uuid],'pendente');
      insert into maestro_flow_montagens(plano,status) values('[["${id(11)}"]]','processando');
    `)
    await db.exec(`
      alter table importacoes add column status text default 'preview', add column total_validas int default 1, add column created_at timestamptz default now();
      alter table importacao_itens add column linha int default 1;
      update importacoes set resumo=resumo||'{"execucao_lotes":{"cursor":1,"total":1,"resultado":{"divergentes":0,"erros":[]}}}';
      alter table cobrancas add column status text default 'novo', add column observacoes text,
        add column valor_pago numeric, add column data_pagamento date,
        add column created_at timestamptz default now()-interval '1 day',
        add column duplicada_origem_excluida_id uuid, add column arquivada_em timestamptz;
      create table condominios(id uuid primary key,carteira_id uuid);
      create table unidades(id uuid primary key,condominio_id uuid,acao_judicial boolean default false);
      insert into condominios values('${id(3)}','${id(2)}');
      insert into unidades(id,condominio_id) values('${id(4)}','${id(3)}');
      insert into unidades values('${id(5)}','${id(3)}',true);
      create table fechamento_pagamentos(cobranca_id uuid references cobrancas);
      create table interacoes(cobranca_id uuid references cobrancas on delete cascade);
      create table saneamento_cobrancas(cobranca_id uuid references cobrancas on delete set null);
      create table whatsapp_web_envios(mensagem_id uuid references mensagens,estado text);
      create table email_tentativas(mensagem_id uuid references mensagens,estado text);
      create table scanner_baixas(cobranca_id uuid references cobrancas);
      insert into whatsapp_web_envios values('${id(41)}');
      insert into mensagens(id,cobranca_id,cobranca_flow_id,payload,status) values
        ('${id(43)}','${id(11)}','${id(40)}','{"cobranca_ids":["${id(11)}"]}','enviada');
      insert into interacoes values('${id(11)}');
      insert into saneamento_cobrancas values('${id(11)}');
      insert into central_pendencias(cobranca_id,status) values('${id(11)}','aberta');
    `)
    const guard = readFileSync('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql', 'utf8')
    await db.exec(guard.slice(guard.indexOf('create function public.cobranca_recibo_identidade'), guard.indexOf('create table public.cobrancas_recibo_guard')))
    await db.exec(readFileSync('supabase/migrations/20261119204211_importacao_ausentes_preservar_acordos_judicializadas.sql', 'utf8'))
    const permissions = (await db.query<any>(`select
      has_function_privilege('anon','public.importacao_remover_cobrancas_ausentes(uuid,jsonb)','execute') as anon,
      has_function_privilege('authenticated','public.importacao_remover_cobrancas_ausentes(uuid,jsonb)','execute') as authenticated,
      has_function_privilege('service_role','public.importacao_remover_cobrancas_ausentes(uuid,jsonb)','execute') as service`)).rows[0]
    assert.deepEqual(permissions,{anon:false,authenticated:false,service:true})
    const rawRun = async (unidades: unknown = [{ linha: 1, unidade_id: id(4) }]) => (await db.query<{ result: any }>(
      'select importacao_remover_cobrancas_ausentes($1,$2::jsonb) result', [id(1), JSON.stringify(unidades)])).rows[0].result
    const adapter = { rpc: async (_name: string, args: Record<string, unknown>) => ({ data: await rawRun(args.p_unidades), error: null }) }
    const run = () => removerCobrancasAusentesDaImportacao(adapter, id(1), [{ linha: 1, unidade_id: id(4) }])
    // Proteções reais de progresso, arquivo, falhas, escopo e reexecução.
    for (const patch of [
      { execucao_lotes: { cursor: 0, total: 1 } },
      { execucao_lotes: { cursor: 1, total: 1, resultado: { divergentes: 1 } } },
      { execucao_lotes: { cursor: 1, total: 1, resultado: { erros: ['Linha 1: falha de gravação'] } } },
      { parcial: true }, { relatorioCompleto: false },
    ]) {
      await db.exec('begin')
      await db.query('update importacoes set resumo=resumo||$1::jsonb', [JSON.stringify(patch)])
      assert.equal((await run()).removidas, 0)
      await db.exec('rollback')
    }
    assert.equal((await rawRun([])).removidas, 0)
    assert.equal((await rawRun([{ linha: 1, unidade_id: id(99) }])).removidas, 0)
    await db.exec("update importacoes set status='confirmada'")
    assert.equal((await run()).removidas, 0)
    await db.exec("update importacoes set status='preview'")
    // Situações judiciais têm proteção independente de qualquer marcador da ADM.
    for (const [n, op, financeiro, unidade, status] of [
      [50,'regular','em_aberto',4,'regular'], [51,'em_negociacao','em_aberto',4,'em_negociacao'],
      [52,'suspenso','em_aberto',4,'suspenso'], [53,'novo','renegociado',4,'novo'],
      [54,'judicializado','em_aberto',4,'novo'], [55,'novo','em_aberto',4,'judicializado'],
      [56,'novo','em_aberto',5,'novo'], [57,'novo','pago',4,'novo'],
      [58,'novo','em_aberto',4,'novo'], [59,'novo','em_aberto',4,'novo'],
      [60,'novo','em_aberto',4,'novo'],
    ] as const) {
      await db.query('insert into cobrancas(id,condominio_id,carteira_id,unidade_id,vencimento,status_operacional,status_financeiro,status) values($1,$2,$3,$4,$5,$6,$7,$8)',
        [id(n),id(3),id(2),id(unidade),'2024-03-10',op,financeiro,status])
    }
    await db.exec(`insert into fechamento_pagamentos values('${id(58)}');
      update cobrancas set created_at=now()+interval '1 day' where id='${id(59)}';
      update cobrancas set carteira_id='${id(90)}' where id='${id(60)}';`)
    // Falha de auditoria reverte remoção, cancelamentos e o marcador de conclusão.
    await db.exec('begin; alter table auditoria_eventos add constraint falha_auditoria check(false)')
    await assert.rejects(run(), /falha_auditoria/)
    await db.exec('rollback')
    assert.equal((await db.query<any>('select status from mensagens where id=$1',[id(41)])).rows[0].status,'agendada')
    await db.exec("update importacoes set total_invalidas=1")
    assert.equal((await run()).removidas, 0)
    await db.exec("update importacoes set total_invalidas=0,resumo=jsonb_set(resumo,'{recorte_regua}','\"parcial\"')")
    assert.equal((await run()).removidas, 0)
    await db.exec("update importacoes set resumo=jsonb_set(resumo,'{recorte_regua}','\"todos\"')")
    // Pagamentos prevalecem mesmo quando os status ainda não foram atualizados.
    for (const protection of [
      `update cobrancas set valor_pago=10 where id='${id(11)}'`,
      `update cobrancas set data_pagamento=current_date where id='${id(11)}'`,
      `insert into scanner_baixas values('${id(11)}')`,
    ]) {
      await db.exec('begin')
      await db.exec(protection)
      assert.equal((await run()).removidas,5)
      assert.equal((await db.query('select id from cobrancas where id=$1',[id(11)])).rows.length,1)
      await db.exec('rollback')
    }
    // A limpeza não pode cancelar uma mensagem que já pode ter efeito externo.
    for (const reservation of [
      `update mensagens set status='em_envio' where id='${id(41)}'`,
      `insert into email_tentativas values('${id(41)}','em_envio')`,
      `update whatsapp_web_envios set estado='reservado'`,
      `update flow_progressao set token='lease-ativa'`,
      `update maestro_flow_montagens set lease_ate=now()+interval '1 minute'`,
    ]) {
      await db.exec('begin')
      await db.exec(reservation)
      await assert.rejects(run(),/envio ou execução reservada/)
      await db.exec('rollback')
      assert.equal((await db.query('select id from cobrancas where id=$1',[id(11)])).rows.length,1)
    }
    // Resolver uma unidade da prévia obsoleta não pode fazer uma cobrança presente sumir.
    await db.exec('begin')
    await db.query("update importacao_itens set payload=jsonb_set(payload,'{unidade_id}',to_jsonb($1::text))",[id(999)])
    assert.equal((await run()).removidas,6)
    assert.equal((await db.query<any>("select payload->>'unidade_id' as unidade from importacao_itens")).rows[0].unidade,id(4))
    await db.exec('rollback')
    // Mesmo recibo em outra data continua presente, independentemente de AE/J.
    await db.exec('begin')
    await db.exec(`update importacao_itens set payload=payload||'{"observacoes":"Recibo AE 123"}';
      update cobrancas set observacoes='Recibo J 123',vencimento='2024-01-10' where id='${id(10)}';`)
    assert.equal((await run()).removidas,6)
    assert.equal((await db.query('select id from cobrancas where id=$1',[id(10)])).rows.length,1)
    await db.exec('rollback')
    // Mesmo vencimento com outro recibo não oculta um débito realmente ausente.
    await db.exec('begin')
    await db.exec(`update importacao_itens set payload=payload||'{"observacoes":"Recibo AE 123"}';
      update cobrancas set observacoes='Recibo 124' where id='${id(10)}';`)
    assert.equal((await run()).removidas,7)
    await db.exec('rollback')
    // A conciliação aceita o recibo de origem Lello após incluir o número do portal.
    await db.exec('begin')
    await db.exec(`update importacao_itens set payload=payload||'{"recibo":"LELLO-63004-100018-20260610"}';`)
    await db.query('update cobrancas set observacoes=$1 where id=$2',
      ['Recibo: 53105612\nConversão de relatório - recibo LELLO-63004-100018-20260610\nHistórico original',id(10)])
    assert.equal((await run()).removidas,6)
    await db.exec('rollback')
    const result = await run()
    assert.equal(result.removidas, 6)
    assert.deepEqual(result.ids.sort(), [id(11), id(12), id(50), id(51), id(52), id(53)])
    assert.equal(result.mensagens_canceladas, 1)
    assert.equal(result.itens_removidos, 1)
    const message = (await db.query<any>('select * from mensagens where id=$1',[id(41)])).rows[0]
    assert.equal(message.status, 'cancelada')
    assert.equal(message.cobranca_id, null)
    assert.deepEqual(message.payload.cobranca_ids, [])
    const enviada = (await db.query<any>('select * from mensagens where id=$1',[id(43)])).rows[0]
    assert.equal(enviada.status,'enviada')
    assert.deepEqual(enviada.payload.cobranca_ids,[id(11)])
    assert.equal(enviada.cobranca_id,null)
    assert.equal((await db.query('select * from whatsapp_web_envios')).rows.length,1)
    assert.equal((await db.query<any>('select status from flow_progressao')).rows[0].status, 'cancelado')
    assert.equal((await db.query('select * from lote_itens')).rows.length, 0)
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 1)
    assert.equal((await db.query<any>('select status from central_pendencias')).rows[0].status,'resolvida')
    assert.equal((await db.query<any>('select cobranca_id from interacoes')).rows[0].cobranca_id,null)
    const replay = await run()
    assert.equal((replay as any).ja_processada,true)
    assert.equal(replay.removidas,6)
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length,1)
    console.log('OK: ausentes sem acordo/judicialização removidas; acordos, judicialização, pagamentos e escopo preservados; lote completo obrigatório; histórico, auditoria transacional e repetição protegidos.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
