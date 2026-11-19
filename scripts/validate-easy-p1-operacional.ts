import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixtureOperacional} from './easy-p1-operacional-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {iniciarFlow} from './easy-flow-transaction-fixture';
import {cicloFechamentoCobranca} from '../features/flows/cobranca/ciclo-fechamento';
import {estadoConsultaPague} from '../features/easy-cob/pague-model';
import {avaliarSaudeWorker} from '../features/easy-cob/worker-health-model';

test('pedido Maestro vincula efeitos/configuração; replay conserva resultado, deriva carteira no banco e nega legado sem consentimento',async()=>{
  const {db,conferir,solicitar}=await fixtureOperacional();try{
    await db.exec('set role service_role');const e=await conferir();assert.equal(e.ativacaoAutomatica,false);
    assert.equal(await solicitar(e),1);assert.equal(await solicitar(e),1);
    assert.equal((await db.query('select * from agente_execucoes')).rows.length,1);
    await assert.rejects(db.query('select easy_maestro_captar($1,$2,$3,$4,$5,$6)',[[id(1)],'sintetica',id(10),id(81),true,[id(2)]]),/consentimento/);
    await assert.rejects(db.exec('update agente_execucoes set easy_maestro_montar_flow=false'),/imutáveis/);
    await db.exec('reset role; delete from usuarios_carteiras');await assert.rejects(conferir(),/indisponível/);
  }finally{await db.close();}
});

test('mudança de configuração invalida resumo e execução; replay do recibo não duplica pedido',async()=>{
  const {db,conferir,solicitar}=await fixtureOperacional();try{
    const e=await conferir();await db.exec('update maestro_flow_controle set ativo=true');await assert.rejects(solicitar(e),/mudaram/);
    const atual=await conferir();assert.equal(atual.ativacaoAutomatica,true);await solicitar(atual);
    await db.exec('update maestro_flow_controle set ativo=false');await assert.rejects(db.exec("update agente_execucoes set status='em_execucao'"),/Configuração/);
    assert.equal(await solicitar(atual),1);assert.equal((await db.query('select * from agente_execucoes')).rows.length,1);
  }finally{await db.close();}
});

test('ativação automática só entra na fila com consentimento e configuração vigente',async()=>{
  const {db,conferir,solicitar}=await fixtureOperacional();try{
    const e=await conferir();await solicitar(e);const exec=(await db.query<any>('select id from agente_execucoes')).rows[0].id;
    await db.query("insert into maestro_flow_montagens(id,execucao_id,condominio_id,status) values($1,$2,$3,'pendente')",[id(81),exec,id(2)]);
    await db.query("insert into lotes(id,status) values($1,'concluido')",[id(90)]);
    await db.exec('update maestro_flow_controle set ativo=true');
    await db.query("insert into cobranca_flows(id,lote_id,carteira_id,status,total_mensagens,payload) values($1,$2,$3,'pronto',1,$4)",[id(91),id(90),id(1),JSON.stringify({origem:'easy_maestro',montagem_id:id(81)})]);
    assert.equal((await db.query('select * from maestro_flow_ativacoes')).rows.length,0);
    await assert.rejects(db.query('select maestro_flow_lote($1,$2)',[id(81),id(1)]),/Configuração/);
    await db.query('insert into maestro_flow_ativacoes(flow_id,carteira_id) values($1,$2)',[id(91),id(1)]);
    assert.equal((await db.query<any>('select maestro_flow_ativar($1,$2) r',[id(91),'sintetico'])).rows[0].r,'manual');
    assert.equal((await db.query<any>('select status from cobranca_flows')).rows[0].status,'pronto');
    const autorizado=await conferir();await solicitar(autorizado,id(98));
    const novo=(await db.query<any>('select id from agente_execucoes where easy_maestro_lote_id=$1',[id(98)])).rows[0].id;
    await db.query("insert into maestro_flow_montagens(id,execucao_id,condominio_id,status) values($1,$2,$3,'pendente')",[id(82),novo,id(2)]);
    await db.query("insert into lotes(id,status) values($1,'concluido')",[id(93)]);
    await db.query("insert into cobranca_flows(id,lote_id,carteira_id,status,total_mensagens,payload) values($1,$2,$3,'pronto',1,$4)",[id(92),id(93),id(1),JSON.stringify({origem:'easy_maestro',montagem_id:id(82)})]);
    assert.equal((await db.query('select * from maestro_flow_ativacoes where flow_id=$1',[id(92)])).rows.length,1);
    assert.equal((await db.query<any>('select maestro_flow_ativar($1,$2) r',[id(92),'sintetico'])).rows[0].r,'ativado');
  }finally{await db.close();}
});

test('recuperação administrativa exige papel/carteira/motivo/versão e nunca agenda mensagens',async()=>{
  const {db}=await fixtureOperacional();try{
    await db.exec('update agente_receitas set ativo=false');
    const f=await iniciarFlow(db);await f.montar();
    await assert.rejects(db.query('select easy_flow_admin_conferir($1,$2)',[f.run.id,id(10)]),/indisponível/);
    await db.query("insert into profiles values($1,'gestor')",[id(99)]);
    await assert.rejects(db.query('select easy_flow_admin_conferir($1,$2)',[f.run.id,id(99)]),/indisponível/);
    const conferir=async()=>(await db.query<any>('select easy_flow_admin_conferir($1,$2) r',[f.run.id,id(11)])).rows[0].r;
    const r=await conferir();
    await assert.rejects(db.query('select easy_flow_admin_reconciliar($1,$2,$3,$4,$5)',[f.run.id,id(11),r.versao,'curto',id(90)]),/motivo/);
    await db.query("update easy_flow_execucoes set status='montando' where id=$1",[f.run.id]);
    await assert.rejects(db.query('select easy_flow_admin_reconciliar($1,$2,$3,$4,$5)',[f.run.id,id(11),r.versao,'Conferência sintética',id(90)]),/mudou/);
    const novo=await conferir();const args=[f.run.id,id(11),novo.versao,'Conferência sintética',id(90)];
    const retorno=(await db.query<any>('select easy_flow_admin_reconciliar($1,$2,$3,$4,$5) r',args)).rows[0].r;
    assert.equal(retorno.status,'pronto');assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    await db.query('select easy_flow_admin_reconciliar($1,$2,$3,$4,$5)',args);
    assert.equal((await db.query("select * from easy_flow_eventos where evento='reconciliacao_administrativa'")).rows.length,1);
  }finally{await db.close();}
});

test('saúde usa heartbeat, fila e conclusão efetiva, sem erro ou configuração sensível no resultado',async()=>{
  const {db}=await fixtureOperacional();try{
    await db.query("insert into agente_workers values('worker_sintetico',now())");
    await db.query("insert into agente_execucoes(receita_id,carteira_id,status,created_at,tentativas) values($1,$2,'pendente',now()-interval '1 hour',2)",[id(8),id(1)]);
    const r=(await db.query<any>('select easy_workers_saude($1,$2,$3,$4) r',[id(10),'maestro','sintetica',360])).rows[0].r;
    assert.equal(r.workers[0].fila,1);assert.equal(r.workers[0].tentativas,2);assert.ok(r.workers[0].ultimoSinal);assert.equal(r.workers[0].ultimoSucesso,null);
    assert.equal(JSON.stringify(r).includes('config_json'),false);assert.equal(JSON.stringify(r).includes('metadata_json'),false);
    await db.query('insert into scanner_configuracoes values($1,$2)',[id(60),id(2)]);
    await db.query("insert into easy_pague_consultas(id,carteira_id,configuracao_id,estado) values($1,$2,$3,'consultando')",[id(61),id(1),id(60)]);
    await db.exec("update easy_pague_consultas set estado='concluido'");assert.ok((await db.query<any>('select finalizado_em from easy_pague_consultas')).rows[0].finalizado_em);
    await db.exec("update easy_pague_consultas set estado='fila'");assert.equal((await db.query<any>('select finalizado_em from easy_pague_consultas')).rows[0].finalizado_em,null);
  }finally{await db.close();}
});

test('Pag distingue consulta e confirmação sem afirmar baixa; heartbeat ausente não afirma worker desligado',()=>{
  const p:any={estado:'concluido',configuracao_id:id(1),resultado:{estado:'pendente'}};assert.match(estadoConsultaPague(p),/sem confirmação suficiente/);
  p.resultado={estado:'confirmado',data_pagamento:'2026-11-18'};assert.match(estadoConsultaPague(p),/encontrada na consulta/);
  assert.equal(/baixada|quitada/.test(estadoConsultaPague(p)),false);
  const worker:any={ultimoSinal:null,fila:2};assert.equal(avaliarSaudeWorker(worker,360).recente,false);assert.match(avaliarSaudeWorker(worker,360).texto,/aguardando/);
  worker.fila=0;assert.match(avaliarSaudeWorker(worker,360).texto,/sob demanda/);
  assert.equal(cicloFechamentoCobranca(null),null);
});
