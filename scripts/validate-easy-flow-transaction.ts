import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixtureFlow,iniciarFlow} from './easy-flow-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {inserirCobranca} from './easy-cap-transaction-fixture';

test('montagem e liberação têm recibos atômicos; repetição recupera sem duplicar',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);assert.equal((await f.iniciar()).rows[0].r.id,f.run.id);
    const run=(await f.montar()).rows[0].r;assert.equal(run.status,'pronto');
    assert.equal((await f.montar(0,{mensagens:[]})).rows[0].r.flow_ids[0],run.flow_ids[0]);
    assert.equal((await db.query('select * from mensagens')).rows.length,1);
    assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    assert.equal((await f.liberar()).rows[0].n,1);assert.equal((await f.liberar()).rows[0].n,1);
    assert.equal((await db.query('select * from email_agenda')).rows.length,1);
    assert.equal((await f.reconciliar()).rows[0].r.status,'concluido');
  }finally{await db.close();}
});

test('falha no fim da montagem reverte lote, flow, mensagens, promoção e recibo',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);
    await db.exec(`create function falhar() returns trigger language plpgsql as $$begin raise exception 'fault'; end $$;
      create trigger fault before insert on easy_flow_eventos for each row execute function falhar();`);
    await assert.rejects(f.montar(),/fault/);
    for(const t of ['lotes','cobranca_flows','mensagens','lote_itens'])assert.equal((await db.query('select * from '+t)).rows.length,0);
    assert.equal((await db.query<any>('select status_operacional from cobrancas')).rows[0].status_operacional,'novo');
    assert.equal((await db.query<any>('select montada_em from easy_flow_partes')).rows[0].montada_em,null);
    await db.exec('drop trigger fault on easy_flow_eventos');await f.montar();
  }finally{await db.close();}
});

test('falha após agendar reverte agenda, estado e recibo; próxima tentativa agenda uma vez',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await f.montar();
    await db.exec(`create function falhar() returns trigger language plpgsql as $$begin raise exception 'fault'; end $$;
      create trigger fault before update on easy_flow_partes for each row execute function falhar();`);
    await assert.rejects(f.liberar(),/fault/);
    assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    assert.equal((await db.query<any>('select status from mensagens')).rows[0].status,'pendente_aprovacao');
    await db.exec('drop trigger fault on easy_flow_partes');assert.equal((await f.liberar()).rows[0].n,1);
  }finally{await db.close();}
});

test('reservas impedem montagem concorrente e agenda direta; ativador público usa recibo',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);
    await assert.rejects(db.query("insert into mensagens(cobranca_id,canal,status) values($1,'email','agendada')",[id(30)]),/reservada/);
    await assert.rejects(db.query('insert into lote_itens(cobranca_id) values($1)',[id(30)]),/reservada/);
    await assert.rejects(db.query("insert into mensagens(canal,status,payload) values('email','agendada',$1)",[JSON.stringify({cobranca_ids:[id(30)]})]),/reservada/);
    const run=(await f.montar()).rows[0].r;
    await assert.rejects(db.exec("update mensagens set status='agendada',scheduled_at=now()"),/reservada|não liberada/);
    await assert.rejects(db.exec("update cobranca_flows set status='em_execucao'"),/recibo/);
    const args=[run.flow_ids[0],'sintetico',id(10)];
    await db.query('select email_ativar_flow($1,$2,$3)',args);await db.query('select email_ativar_flow($1,$2,$3)',args);
    assert.equal((await db.query('select * from email_agenda')).rows.length,1);
  }finally{await db.close();}
});

test('reconciliação recompõe contadores pelo ledger e mantém divergências em atenção',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);const r=(await f.montar()).rows[0].r;
    await db.exec("update easy_flow_execucoes set status='montando',parte=0,flow_ids='{}',mensagens=0");
    const result=(await f.reconciliar()).rows[0].r;assert.equal(result.parte,1);assert.deepEqual(result.flow_ids,r.flow_ids);assert.equal(result.status,'pronto');
    await db.query('insert into email_tentativas(mensagem_id,estado) select id,$1 from mensagens',['incerto']);
    assert.equal((await f.reconciliar()).rows[0].r.status,'atencao');
    await assert.rejects(f.liberar(),/revisão/);
    assert.equal((await db.query('select * from email_agenda')).rows.length,0);
  }finally{await db.close();}
});

test('mudança de contato ou pagamento após preview impede montagem sem efeitos',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await db.exec("update unidades set email='alterado@example.invalid'");
    await assert.rejects(f.montar(),/alterados/);assert.equal((await db.query('select * from mensagens')).rows.length,0);
  }finally{await db.close();}
});

test('manifesto incompleto e fora da parte falha com rollback',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await assert.rejects(f.montar(0,f.manifesto([id(99)])),/inválida/);
    assert.equal((await db.query('select * from lotes')).rows.length,0);
  }finally{await db.close();}
});

test('autorização por autor, carteira e perfil; funções e tabelas privadas',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);
    await assert.rejects(db.query('select easy_flow_reconciliar($1,$2)',[f.run.id,id(11)]),/indisponível/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select easy_flow_reconciliar($1,$2)',[f.run.id,id(10)]),/permission denied/);
    await assert.rejects(db.exec('select * from easy_flow_partes'),/permission denied/);
    await db.exec('reset role');await db.exec("update profiles set role='leitura'");
    await assert.rejects(f.montar(),/indisponível/);
  }finally{await db.close();}
});

test('descarte serializado só remove reservas de resumo sem efeitos',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await db.query('select easy_flow_descartar($1,$2)',[f.run.id,id(10)]);
    assert.equal((await db.query('select * from easy_flow_reservas')).rows.length,0);
    assert.equal((await f.reconciliar()).rows[0].r.status,'cancelado');
    await assert.rejects(f.montar(),/ordem/);
  }finally{await db.close();}
});

test('partes sucessivas não invalidam seus próprios snapshots; liberações seguem a ordem',async()=>{
  const db=await fixtureFlow();try{
    await db.query("insert into unidades(id,carteira_id,condominio_id,identificacao,responsavel_nome,email) values($1,$2,$3,'202','Pessoa sintética','outra@example.invalid')",[id(7),id(1),id(2)]);
    await inserirCobranca(db,31,'999');await db.query('update cobrancas set unidade_id=$1 where id=$2',[id(7),id(31)]);
    const f=await iniciarFlow(db,[[id(30)],[id(31)]]);
    await assert.rejects(f.montar(1),/ordem/);
    assert.equal((await f.montar()).rows[0].r.status,'entre_partes');
    assert.equal((await f.montar(1)).rows[0].r.status,'pronto');
    await assert.rejects(f.liberar(1),/revisão/);
    await f.liberar();await f.liberar(1);assert.equal((await f.reconciliar()).rows[0].r.liberadas,2);
    assert.equal((await db.query('select * from email_agenda')).rows.length,2);
  }finally{await db.close();}
});

test('alterações de SMTP, régua, pagamento e bloqueio após montagem impedem liberar',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await f.montar();
    for(const sql of ["update integracoes_smtp_config set ativo=false",'update regua_etapas set delay_dias=5',"update cobrancas set status_financeiro='quitado'","update unidades set acao_judicial=true"]){
      await db.exec('begin');await db.exec(sql);await assert.rejects(f.liberar(),/revisão/);await db.exec('rollback');
      assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    }
    await f.liberar();
    await db.exec('update integracoes_smtp_config set ativo=false');
    assert.equal((await f.liberar()).rows[0].n,1); // recibo antes da configuração
  }finally{await db.close();}
});

test('reconciliação não anexa órfãos, não recria artefatos removidos e preserva legado',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);const r=(await f.montar()).rows[0].r;
    await db.query('delete from lote_itens where cobranca_flow_id=$1',[r.flow_ids[0]]);
    assert.equal((await f.reconciliar()).rows[0].r.status,'atencao');
    assert.equal((await db.query('select * from lote_itens')).rows.length,0);
    await db.query("insert into lotes(id,status) values($1,'concluido')",[id(90)]);
    await db.query("insert into cobranca_flows(id,lote_id,status,payload) values($1,$2,'pausado',$3)",[id(91),id(90),JSON.stringify({easy_execucao_id:f.run.id,easy_indice:99})]);
    const recuperado=(await f.reconciliar()).rows[0].r;assert.equal(recuperado.status,'atencao');assert.deepEqual(recuperado.flow_ids,r.flow_ids);
    await db.exec('update easy_flow_execucoes set protocolo=1');
    assert.equal((await f.reconciliar()).rows[0].r.status,'atencao');
    await assert.rejects(f.montar(),/legada/);await assert.rejects(f.liberar(),/legada/);
  }finally{await db.close();}
});

test('service_role executa o protocolo; ativação comum continua usando o motor instalado',async()=>{
  const db=await fixtureFlow();try{
    await db.exec('set role service_role');const f=await iniciarFlow(db);const r=(await f.montar()).rows[0].r;
    await f.liberar();await f.reconciliar();
    await db.query("insert into lotes(id,status) values($1,'concluido')",[id(90)]);
    await db.query("insert into cobranca_flows(id,carteira_id,lote_id,status,payload) values($1,$2,$3,'pausado','{}')",[id(91),id(1),id(90)]);
    await db.query("insert into mensagens(id,carteira_id,cobranca_flow_id,lote_id,canal,status) values($1,$2,$3,$4,'whatsapp','pendente_aprovacao')",[id(92),id(1),id(91),id(90)]);
    assert.equal((await db.query<any>('select email_ativar_flow($1,$2,$3) n',[id(91),'',id(10)])).rows[0].n,1);
    assert.equal((await db.query<any>('select status from cobranca_flows where id=$1',[r.flow_ids[0]])).rows[0].status,'em_execucao');
  }finally{await db.close();}
});

test('resultado incerto após liberação e agenda ausente exigem revisão sem novo agendamento',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await f.montar();await f.liberar();
    await db.exec("insert into email_tentativas(mensagem_id,estado) select id,'incerto' from mensagens");
    assert.equal((await f.reconciliar()).rows[0].r.status,'atencao');
    await f.liberar();assert.equal((await db.query('select * from email_agenda')).rows.length,1);
    await db.exec('delete from email_tentativas; delete from email_agenda');
    assert.equal((await f.reconciliar()).rows[0].r.status,'atencao');
    await f.liberar();assert.equal((await db.query('select * from email_agenda')).rows.length,0);
  }finally{await db.close();}
});

test('retorno de ativação sem agenda efetiva não produz recibo de liberação',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);await f.montar();
    await db.exec(`create or replace function email_reservar_horario(p_id uuid,p_remetente text) returns timestamptz language sql as 'select now()';`);
    await assert.rejects(f.liberar(),/incompleto/);
    assert.equal((await db.query<any>('select liberada_em from easy_flow_partes')).rows[0].liberada_em,null);
    assert.equal((await db.query<any>('select status from cobranca_flows')).rows[0].status,'pausado');
  }finally{await db.close();}
});
