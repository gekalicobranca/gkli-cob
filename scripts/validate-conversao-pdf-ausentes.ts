import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { conversaoPdfDeCobrancas, removerAusentesDaConversaoPdf } from '../features/importacoes/ausentes-conversao'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function main() {
  const db = new PGlite()
  try {
    // Production uses CASCADE for messages: a deletion must preserve sent history explicitly.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table condominios(id uuid primary key,carteira_id uuid);
      create table unidades(id uuid primary key,condominio_id uuid);
      create table conversoes_relatorio(id uuid primary key,condominio_id uuid,carteira_id uuid,status text,preview_json jsonb,criado_em timestamptz default now());
      create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,vencimento date,duplicada_de_id uuid,status_operacional text,status_financeiro text,observacoes text,created_at timestamptz default now()-interval '1 day');
      create table acordos(id uuid,cobranca_id uuid references cobrancas);
      create table acordo_cobrancas(id uuid,cobranca_id uuid references cobrancas);
      create table fechamento_pagamentos(cobranca_id uuid references cobrancas);
      create table interacoes(cobranca_id uuid references cobrancas on delete cascade);
      create table saneamento_cobrancas(cobranca_id uuid references cobrancas on delete set null);
      create table cobranca_flows(id uuid primary key,payload jsonb,status text,cancelado_em timestamptz,total_mensagens int,total_pendentes int,total_agendadas int,total_enviadas int,total_falhas int,proximo_disparo_em timestamptz);
      create table mensagens(id uuid primary key,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid,payload jsonb,status text,status_operacional text,cancelado_em timestamptz,cancelada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,motivo_cancelamento text);
      create table lote_itens(id uuid,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid);
      create table flow_progressao(cobranca_ids uuid[],status text,token text,lease_ate timestamptz,erro text,updated_at timestamptz);
      create table maestro_flow_montagens(plano jsonb,status text,token text,lease_ate timestamptz,updated_at timestamptz);
      create table central_pendencias(cobranca_id uuid references cobrancas on delete set null,entidade_tipo text,entidade_id uuid,status text,resolvido_em timestamptz,payload jsonb);
      create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
      insert into condominios values('${id(3)}','${id(2)}');
      insert into unidades values('${id(4)}','${id(3)}');
      insert into conversoes_relatorio values('${id(1)}','${id(3)}','${id(2)}','preview','{"tipoConversao":"cobrancas","arquivo":"captacao.pdf","cobrancas":[{},{}]}',now());
    `)
    const old = readFileSync('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql', 'utf8')
    await db.exec(old.slice(old.indexOf('create function public.cobranca_recibo_identidade'), old.indexOf('create table public.cobrancas_recibo_guard')))
    await db.exec(readFileSync('supabase/migrations/20261022184119_conversao_pdf_remover_ausentes_sem_acordo.sql', 'utf8'))
    for (const [n, date, status, financeiro, recibo] of [
      [10,'2026-10-05','em_cobranca_ativa','em_aberto','R100'], [11,'2025-10-05','em_cobranca_ativa','em_aberto','R101'],
      [12,'2026-09-05','novo','em_aberto','R102'], [13,'2026-08-05','em_cobranca_ativa','em_aberto','R103'],
      [14,'2026-07-05','em_cobranca_ativa','quitado','R104'], [15,'2026-06-05','novo','em_aberto','R105'],
      [16,'2026-05-05','novo','em_aberto','R106'], [17,'2026-04-05','possivel_acordo','em_aberto','R107'],
      [18,'2026-03-05','regular','em_aberto','R108'], [19,'2026-02-05','em_negociacao','em_aberto','R109'],
      [20,'2020-01-01','em_cobranca_ativa','em_aberto','R110'], [21,'2026-01-05','novo','em_aberto','R111'],
      [22,'2026-01-06','novo','em_aberto','R112'], [23,'2026-10-06','novo','em_aberto','R200'],
      [24,'2026-10-05','novo','em_aberto','R999'],
    ] as const) {
      await db.query('insert into cobrancas(id,condominio_id,carteira_id,unidade_id,vencimento,status_operacional,status_financeiro,observacoes) values($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(n===15?30:3),id(2),id(4),date,status,financeiro,`Recibo ${recibo}`])
    }
    await db.exec(`
      update cobrancas set created_at=now()+interval '1 minute' where id='${id(21)}';
      insert into acordos values('${id(31)}','${id(13)}');
      insert into acordo_cobrancas values('${id(32)}','${id(16)}');
      insert into fechamento_pagamentos values('${id(22)}');
      insert into interacoes values('${id(11)}'); insert into saneamento_cobrancas values('${id(11)}');
      insert into cobranca_flows(id,payload,status) values('${id(40)}','{"cobranca_ids":["${id(11)}"]}','pausado'),('${id(45)}','{"cobranca_ids":["${id(12)}"]}','ativo');
      insert into mensagens(id,cobranca_id,cobranca_flow_id,payload,status,status_operacional) values
        ('${id(41)}','${id(11)}','${id(40)}','{"cobranca_ids":["${id(11)}"]}','enviada','enviada'),
        ('${id(46)}','${id(12)}','${id(45)}','{"cobranca_ids":["${id(12)}","${id(13)}"]}','agendada','agendada');
      insert into lote_itens values('${id(42)}','${id(11)}','${id(40)}'),('${id(47)}','${id(12)}','${id(45)}');
      insert into flow_progressao(cobranca_ids,status) values(array['${id(11)}'::uuid],'pendente');
      insert into maestro_flow_montagens(plano,status) values('[["${id(11)}"]]','processando');
      insert into central_pendencias(cobranca_id,status) values('${id(11)}','em_tratamento');
    `)
    const importadas = [{ unidade_id:id(4),vencimento:'2026-10-05',recibo:'R100' },{ unidade_id:id(4),vencimento:'2026-10-07',recibo:'R200' }]
    const run = async (rows: any=importadas, condo=id(3)) => (await db.query<{ result:any }>('select conversao_remover_cobrancas_ausentes($1,$2,$3,$4) result',[id(1),condo,id(2),JSON.stringify(rows)])).rows[0].result
    assert.equal((await run([])).removidas,0)
    assert.equal((await run([importadas[0]])).removidas,0)
    await assert.rejects(run(importadas,id(30)),/fora do condomínio/)
    await db.exec(`update conversoes_relatorio set preview_json=preview_json||'{"parcial":true}'`)
    assert.equal((await run()).removidas,0)
    await db.exec(`update conversoes_relatorio set preview_json=preview_json-'parcial'`)
    await assert.rejects(run([importadas[0],{unidade_id:id(30),vencimento:'2026-10-05'}]),/fora do condomínio/)
    await db.exec(`update conversoes_relatorio set status='concluido'`)
    assert.equal((await run()).removidas,0)
    await db.exec(`update conversoes_relatorio set status='preview'; create table bloqueio(cobranca_id uuid references cobrancas); insert into bloqueio values('${id(12)}')`)
    await assert.rejects(run(),/foreign key|constraint/i)
    assert.equal((await db.query<any>('select status from mensagens where id=$1',[id(46)])).rows[0].status,'agendada','Falha no DELETE precisa reverter cancelamentos')
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length,0)
    await db.exec('drop table bloqueio')
    let calls=0
    const adapter={rpc:async(_name:string,args:Record<string,unknown>)=>{calls++;assert.equal(_name,'conversao_remover_cobrancas_ausentes');return {data:await run(args.p_importadas),error:null}}}
    const input={conversaoId:id(1),condominioId:id(3),carteiraId:id(2),preview:{cobrancas:[{},{}]},importadas,falhas:0}
    assert.equal(conversaoPdfDeCobrancas({arquivo:'captacao.PDF',tipoConversao:'cobrancas'}),true)
    assert.equal(conversaoPdfDeCobrancas({arquivo:'captacao.xlsx',tipoConversao:'cobrancas'}),false)
    assert.equal(conversaoPdfDeCobrancas({arquivo:'contatos.pdf',tipoConversao:'unidades'}),false)
    for(const changed of [{falhas:1},{importadas:[importadas[0]]},{preview:{cobrancas:[{},{}],relatorioCompleto:false}},{preview:{cobrancas:[{},{}],recorteRegua:'parcial'}}])assert.equal((await removerAusentesDaConversaoPdf(adapter,{...input,...changed})).removidas,0)
    assert.equal(calls,0)
    const result=await removerAusentesDaConversaoPdf(adapter,input) as any
    assert.equal(result.removidas,6)
    assert.deepEqual(result.ids.sort(),[11,12,17,18,19,24].map(id))
    assert.equal(result.mensagens_canceladas,1)
    const sent=(await db.query<any>('select * from mensagens where id=$1',[id(41)])).rows[0]
    assert.equal(sent.status,'enviada');assert.equal(sent.cobranca_id,null);assert.deepEqual(sent.payload.cobranca_ids,[id(11)])
    const scheduled=(await db.query<any>('select * from mensagens where id=$1',[id(46)])).rows[0]
    assert.equal(scheduled.status,'cancelada');assert.deepEqual(scheduled.payload.cobranca_ids,[id(13)])
    assert.equal((await db.query<any>('select status from cobranca_flows where id=$1',[id(40)])).rows[0].status,'pausado')
    assert.equal((await db.query<any>('select status from cobranca_flows where id=$1',[id(45)])).rows[0].status,'cancelado')
    assert.equal((await db.query<any>('select status from flow_progressao')).rows[0].status,'cancelado')
    assert.equal((await db.query<any>('select cobranca_id from interacoes')).rows[0].cobranca_id,null)
    assert.equal((await db.query<any>('select status,payload from central_pendencias')).rows[0].payload.pagamento_presumido,false)
    const audit=(await db.query<any>('select * from auditoria_eventos')).rows[0]
    assert.equal(audit.antes.cobrancas.length,6);assert.equal(audit.antes.dependencias.mensagens.length,2)
    assert.equal((await run()).removidas,0)
    assert.equal((await db.query('select * from acordos')).rows.length,1)
    assert.equal((await db.query('select * from acordo_cobrancas')).rows.length,1)
    const permissions=(await db.query<any>(`select has_function_privilege('anon','conversao_remover_cobrancas_ausentes(uuid,uuid,uuid,jsonb)','execute') anon,has_function_privilege('authenticated','conversao_remover_cobrancas_ausentes(uuid,uuid,uuid,jsonb)','execute') auth,has_function_privilege('service_role','conversao_remover_cobrancas_ausentes(uuid,uuid,uuid,jsonb)','execute') service`)).rows[0]
    assert.deepEqual(permissions,{anon:false,auth:false,service:true})
    console.log('OK: PDF completo remove ausentes sem acordo; preserva vínculos diretos/agrupados, quitadas, pagamentos, histórico enviado, pausados, recibos presentes, registros posteriores e outros condomínios; bloqueia parcial/falhas/escopo inválido; cancela pendentes; audita e não repete a limpeza. Nenhum envio.')
  } finally { await db.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})

