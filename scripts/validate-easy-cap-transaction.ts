import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PGlite} from '@electric-sql/pglite';
import {fixtureCap,prepararConversao,previewCap,inserirCobranca} from './easy-cap-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {hashPlanoCaptacao,prepararPlanoCaptacao} from '../features/easy-cob/captacao-plano';

async function fingerprint(db:PGlite) {
  const tables=(await db.query<{tablename:string}>("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const state:Record<string,unknown>={};
  for(const t of tables)state[t.tablename]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') dados from public.${t.tablename} t`)).rows;
  return JSON.stringify(state);
}

test('marcadores manuais da main preservam status, origem e bloqueio na RPC transacional',async()=>{
  const db=await fixtureCap();try{
    const ano=(await db.query<{ano:number}>("select extract(year from now() at time zone 'America/Sao_Paulo')::int ano")).rows[0].ano;
    const preview=previewCap(ano);preview.valorTotal=450;
    preview.cobrancas=[...(['AE','AJ','J'] as const)].map((marcadorOrigem,i)=>({...preview.cobrancas[0],unidade:String(101+i),recibo:String(123+i),origemSistema:'Easy Flow manual',marcadorOrigem}));
    const p=await prepararConversao(db,20,preview);await p.confirmar();
    const rows=(await db.query<any>('select status_operacional,automacao_bloqueada,observacoes from cobrancas order by observacoes')).rows;
    assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.status_operacional),['possivel_acordo','judicializado','judicializado']);
    assert.ok(rows.every(r=>r.automacao_bloqueada));assert.ok(rows[0].observacoes.includes('Marcador origem: AE'));
  }finally{await db.close();}
});
async function base(db:PGlite) {
  await inserirCobranca(db,30);await inserirCobranca(db,31,'999');
  const ano=(await db.query<{ano:number}>("select extract(year from now() at time zone 'America/Sao_Paulo')::int ano")).rows[0].ano;
  const preview=previewCap(ano);preview.valorTotal=400;preview.totalParcelas=1;
  preview.cobrancas.push({...preview.cobrancas[0],unidade:'202',recibo:'888',responsavel:'Responsável sintético',email:'sintetico@example.invalid',valorPrincipal:250,juros:0,valorTotal:250,
    parcelas:[{unidade:'202',responsavel:'Responsável sintético',vencimento:`01/01/${ano}`,referencia:'Recibo 888',valor:250}]});
  await db.exec(`insert into cobranca_flows(id,status) values('${id(40)}','pausado');
    insert into mensagens(id,carteira_id,cobranca_id,cobranca_flow_id,status,status_operacional) values('${id(41)}','${id(1)}','${id(31)}','${id(40)}','agendada','agendada');
    insert into email_agenda values('${id(41)}');
    insert into flow_progressao(cobranca_ids,status) values(array['${id(31)}']::uuid[],'pendente');`);
  return prepararConversao(db,20,preview);
}

test('aplica unidades, contatos, cobranças, parcelas, arquivo, histórico, auditoria e conclusão juntos; replay não muda nada',async()=>{
  const db=await fixtureCap();try {
    const p=await base(db);
    await db.exec('set role service_role');
    const result=(await p.confirmar()).rows[0].resultado;
    assert.equal(result.resumo.cobrancasCriadas,1);assert.equal(result.resumo.cobrancasAtualizadas,1);
    assert.equal(result.resumo.cobrancasArquivadas,1);assert.equal(result.resumo.unidadesCriadas,1);
    assert.equal(result.resumo.contatosAtualizados,1);assert.equal(result.resumo.parcelasCriadas,1);
    await assert.rejects(()=>db.query("update easy_captacao_resultados set resultado='{}'"),/permission denied/);
    await assert.rejects(()=>db.query('delete from easy_captacao_resultados'),/permission denied/);
    await db.exec('reset role');
    const u=(await db.query<any>('select * from unidades where id=$1',[id(3)])).rows[0];
    assert.equal(u.email,'preservado@example.invalid');assert.equal(u.responsavel_nome,'Responsável preservado');assert.equal(u.telefone,'11999999999');
    const c=(await db.query<any>('select * from cobrancas where id=$1',[id(30)])).rows[0];assert.equal(Number(c.valor_atualizado),150);
    const old=(await db.query<any>('select * from cobrancas where id=$1',[id(31)])).rows[0];assert.ok(old.arquivada_em);assert.equal(Number(old.valor_atualizado),100);
    assert.equal((await db.query<any>('select status from mensagens')).rows[0].status,'cancelada');
    assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    assert.equal((await db.query('select * from captacao_historica_sindico')).rows.length,2);
    assert.equal((await db.query<any>('select status from conversoes_relatorio')).rows[0].status,'concluido');
    assert.ok((await db.query('select * from auditoria_eventos')).rows.length>0);
    const before=await fingerprint(db),replay=(await p.confirmar()).rows[0].resultado;
    assert.equal(replay.jaConfirmada,true);assert.deepEqual(replay.resumo,result.resumo);assert.equal(await fingerprint(db),before);
  } finally {await db.close();}
});

for(const [table,action] of [['unidades','insert'],['unidades','update'],['cobrancas','insert'],['cobranca_parcelas','insert'],
  ['timeline_operacional','insert'],['auditoria_eventos','insert'],['captacao_historica_sindico','insert'],['conversoes_relatorio','update'],['easy_captacao_resultados','insert']]) {
  test(`falha em ${table}/${action} reverte todos os efeitos, inclusive contatos, agenda e conclusão`,async()=>{
    const db=await fixtureCap();try {
      const p=await base(db);const before=await fingerprint(db);
      await db.exec(`create function falha_sintetica() returns trigger language plpgsql as $$ begin raise exception 'falha sintética';end $$;
        create trigger falha before ${action} on public.${table} for each row execute function falha_sintetica();`);
      await assert.rejects(()=>p.confirmar(),/falha sintética/);assert.equal(await fingerprint(db),before);
    } finally {await db.close();}
  });
}

test('mudanças após prévia invalidam o snapshot sem efeito; inclui contatos, pagamentos, acordos e configuração',async()=>{
  const changes=[`update unidades set telefone='11888888888' where id='${id(3)}'`,
    `update cobrancas set valor_pago=10 where id='${id(30)}'`,
    `insert into acordos(id,cobranca_id,condominio_id,unidade_id,status) values('${id(60)}','${id(30)}','${id(2)}','${id(3)}','ativo')`,
    `update condominios set inicio_cobranca_dias=31 where id='${id(2)}'`];
  for(const change of changes){const db=await fixtureCap();try{
    await inserirCobranca(db,30);const p=await prepararConversao(db);await db.exec(change);const before=await fingerprint(db);
    await assert.rejects(()=>p.confirmar(),/mudaram/);assert.equal(await fingerprint(db),before);
  }finally{await db.close();}}
});

test('preserva cobranças pagas, bloqueadas, judiciais, com acordo, scanner, duplicadas, arquivadas e de outro ano',async()=>{
  const db=await fixtureCap();try {
    const ano=(await db.query<{ano:number}>("select extract(year from now())::int ano")).rows[0].ano;
    const preview=previewCap(ano);preview.cobrancas=[];preview.valorTotal=0;
    for(let n=30;n<39;n++){
      await inserirCobranca(db,n,String(n));
      preview.cobrancas.push({...previewCap(ano).cobrancas[0],recibo:String(n)});preview.valorTotal+=150;
    }
    await db.exec(`update cobrancas set data_pagamento=current_date,status_financeiro='quitado' where id='${id(30)}';
      update cobrancas set automacao_bloqueada=true where id='${id(31)}';
      update cobrancas set status_operacional='judicializado' where id='${id(32)}';
      insert into acordos(cobranca_id) values('${id(33)}');
      insert into acordo_cobrancas values('${id(70)}','${id(34)}');
      insert into scanner_baixas(cobranca_id) values('${id(35)}');
      update cobrancas set vencimento=vencimento-interval '1 year' where id='${id(36)}';
      update cobrancas set status='suspenso',status_operacional='suspenso',automacao_bloqueada=true where id='${id(37)}';
      update cobrancas set arquivada_em=now(),arquivamento_motivo='Arquivo sintético protegido' where id='${id(37)}';
      update cobrancas set duplicada_de_id='${id(38)}' where id='${id(32)}';`);
    const old=(await db.query<any>('select jsonb_agg(to_jsonb(c) order by id) base from cobrancas c')).rows[0].base;
    const p=await prepararConversao(db,20,preview);const r=(await p.confirmar()).rows[0].resultado;
    assert.equal(r.resumo.cobrancasIgnoradas,9);assert.equal(r.resumo.cobrancasAtualizadas,0);
    assert.deepEqual((await db.query<any>('select jsonb_agg(to_jsonb(c) order by id) base from cobrancas c')).rows[0].base,old);
  } finally {await db.close();}
});

test('envios em andamento ou incertos e execução Easy Flow pendente recusam o commit',async()=>{
  for(const scenario of ['email','whatsapp','mensagem','flow']){const db=await fixtureCap();try {
    const p=await base(db);
    if(scenario==='email')await db.exec(`insert into email_tentativas values('${id(41)}','incerto')`);
    if(scenario==='whatsapp')await db.exec(`insert into whatsapp_web_envios values('${id(41)}','reservado')`);
    if(scenario==='mensagem')await db.exec(`update mensagens set status='em_envio' where id='${id(41)}'`);
    if(scenario==='flow')await db.exec(`insert into easy_flow_execucoes values('${id(50)}','${id(2)}','atencao')`);
    const before=await fingerprint(db);await assert.rejects(()=>p.confirmar(),/envio|pendente/);assert.equal(await fingerprint(db),before);
  }finally{await db.close();}}
});

test('nega papel público, operador de outra carteira, autor diferente e plano alterado',async()=>{
  const db=await fixtureCap();try {
    const p=await prepararConversao(db);const before=await fingerprint(db);
    await assert.rejects(()=>p.confirmar(id(11)),/Sem permissão/);
    await db.exec(`delete from usuarios_carteiras where user_id='${id(10)}'`);
    await assert.rejects(()=>p.confirmar(),/Sem permissão/);
    await db.exec(`insert into usuarios_carteiras values('${id(10)}','${id(1)}')`);
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);await assert.rejects(()=>p.confirmar(),/permission denied/);
      await assert.rejects(()=>db.query('select * from easy_captacao_resultados'),/permission denied/);await db.exec('reset role');
    }
    await assert.rejects(()=>db.query('select easy_captacao_confirmar($1,$2,$3,$4)',[id(20),id(10),'x'.repeat(64),'y'.repeat(64)]),/prévia mudou/);
    assert.equal(await fingerprint(db),before);
  }finally{await db.close();}
});

test('duas conversões da mesma base não se aplicam em sequência; repetir a primeira recupera recibo',async()=>{
  const db=await fixtureCap();try {
    await inserirCobranca(db,30);const a=await prepararConversao(db,20),b=await prepararConversao(db,21);
    await a.confirmar();const before=await fingerprint(db);
    await assert.rejects(()=>b.confirmar(),/mudaram/);assert.equal(await fingerprint(db),before);
    assert.equal((await a.confirmar()).rows[0].resultado.jaConfirmada,true);
  }finally{await db.close();}
});

test('plano puro rejeita recortes, contatos conflitantes e valores imprecisos; hash resiste a ordem de chaves JSONB',()=>{
  const p=previewCap(2026),plan=prepararPlanoCaptacao(p);
  const reorder=(value:any):any=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'
    ?Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reorder(value[k])])):value;
  assert.equal(hashPlanoCaptacao(plan),hashPlanoCaptacao(reorder(plan)));
  assert.throws(()=>prepararPlanoCaptacao({...p,parcial:true} as any),/completo/);
  assert.throws(()=>prepararPlanoCaptacao({...p,valorTotal:150.001,cobrancas:[{...p.cobrancas[0],valorTotal:150.001}]}),/casas decimais/);
  assert.throws(()=>prepararPlanoCaptacao({...p,valorTotal:300,cobrancas:[p.cobrancas[0],{...p.cobrancas[0],recibo:'999',email:'outro@example.invalid'}]}),/contatos/);
  assert.throws(()=>prepararPlanoCaptacao({...p,valorTotal:750150,cobrancas:Array.from({length:5001},(_,i)=>({...p.cobrancas[0],recibo:String(i)}))}),/5.000/);
});

test('judicial respeita desempate por recibo; garantidora suspende e origem HFlex bloqueia automação',async()=>{
  const db=await fixtureCap();try {
    await db.exec(`update unidades set acao_judicial=true where id='${id(3)}'`);
    const ano=(await db.query<{ano:number}>('select extract(year from now())::int ano')).rows[0].ano;
    const p=previewCap(ano);p.cobrancas.push({...p.cobrancas[0],recibo:'124'});p.valorTotal=300;
    const job=await prepararConversao(db,20,p);await job.confirmar();
    const rows=(await db.query<any>('select observacoes,status_operacional from cobrancas order by observacoes')).rows;
    assert.equal(rows[0].status_operacional,'judicializado');assert.equal(rows[1].status_operacional,'novo');
    await db.exec(`update condominios set bloqueio_garantidora_habilitado=true,bloqueio_garantidora_inicio='${ano}-01-01',bloqueio_garantidora_fim='${ano}-02-01'`);
    const source=previewCap(ano);source.cobrancas=[{...source.cobrancas[0],unidade:'202',recibo:'555',detalhesOrigem:'Acordo HFlex 123'}];
    const j=await prepararConversao(db,21,source);await j.confirmar();
    const c=(await db.query<any>("select status_operacional,automacao_bloqueada,observacoes from cobrancas where observacoes like '%555%' ")).rows[0];
    assert.equal(c.status_operacional,'suspenso');assert.equal(c.automacao_bloqueada,true);assert.match(c.observacoes,/Garantidora/);
  }finally{await db.close();}
});

test('equivalência ambígua de unidade e recibo canônico duplicado abortam sem efeito',async()=>{
  const db=await fixtureCap();try {
    const ano=(await db.query<{ano:number}>('select extract(year from now())::int ano')).rows[0].ano;
    const p=previewCap(ano);p.cobrancas[0].unidade='0101';const j=await prepararConversao(db,20,p);const before=await fingerprint(db);
    await assert.rejects(()=>j.confirmar(),/equivalente/);assert.equal(await fingerprint(db),before);
    const s=previewCap(ano);s.cobrancas.push({...s.cobrancas[0],recibo:'AE 123'});s.valorTotal=300;
    const other=await prepararConversao(db,21,s);const state=await fingerprint(db);
    await assert.rejects(()=>other.confirmar(),/repete uma cobrança/);assert.equal(await fingerprint(db),state);
  }finally{await db.close();}
});

test('limite de 5.000 linhas confirma em uma transação e persiste um único recibo',async(t)=>{
  const db=await fixtureCap();try {
    const ano=(await db.query<{ano:number}>('select extract(year from now())::int ano')).rows[0].ano;
    const p=previewCap(ano);p.cobrancas=Array.from({length:5000},(_,i)=>({...p.cobrancas[0],recibo:String(10000+i)}));p.valorTotal=750000;
    const j=await prepararConversao(db,20,p),start=performance.now();const result=(await j.confirmar()).rows[0].resultado;
    assert.equal(result.resumo.cobrancasCriadas,5000);assert.equal((await db.query('select * from easy_captacao_resultados')).rows.length,1);
    t.diagnostic(`Commit PGlite sintético: ${Math.round(performance.now()-start)} ms; não é SLA de produção.`);
  }finally{await db.close();}
});

test('gatilho que altera valor ao suspender cobrança impede o arquivo e reverte o commit inteiro',async()=>{
  const db=await fixtureCap();try {
    const p=await base(db);const before=await fingerprint(db);
    await db.exec(`create function desvio_sintetico() returns trigger language plpgsql as $$ begin
      if new.status='suspenso' then new.valor_original:=999;end if;return new;end $$;
      create trigger desvio before update on cobrancas for each row execute function desvio_sintetico();`);
    await assert.rejects(()=>p.confirmar(),/campos protegidos/);assert.equal(await fingerprint(db),before);
  }finally{await db.close();}
});
