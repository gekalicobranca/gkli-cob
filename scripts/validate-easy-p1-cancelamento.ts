import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixtureCancelamento} from './easy-p1-cancelamento-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {impedimentoCancelamento} from '../features/acordos/cancelamento-elegibilidade';

test('acordo, parcelas, termos, cobranças, filas, anexo e recibo confirmam juntos; replay não duplica',async()=>{
  const {db,cancelar,resultado}=await fixtureCancelamento();try{
    await db.exec('set role service_role');const r=(await cancelar()).rows[0].r;
    assert.equal(r.confirmado,true);assert.ok(r.documento_id);assert.equal(r.cobrancas_reativadas,1);assert.equal(r.mensagens_canceladas,1);
    assert.deepEqual((await cancelar()).rows[0].r,r);assert.deepEqual((await resultado()).rows[0].r,r);
    await db.exec('reset role');
    assert.deepEqual((await db.query<any>('select status from parcelas_acordo')).rows.map(r=>r.status),['cancelada','cancelada','cancelada']);
    assert.deepEqual((await db.query<any>('select status from acordos_termos order by id')).rows.map(r=>r.status),['expirado','aceito']);
    assert.equal((await db.query<any>('select status from mensagens')).rows[0].status,'cancelada');assert.equal((await db.query('select * from email_agenda')).rows.length,0);
    assert.equal((await db.query('select * from acordo_documentos')).rows.length,1);assert.equal((await db.query('select * from acordo_cancelamentos')).rows.length,1);
    assert.equal((await db.query('select * from auditoria_eventos where evento_tipo=$1',['acordo.formalizacao_cancelada'])).rows.length,1);
  }finally{await db.close();}
});

for(const table of ['acordo_documentos','timeline_operacional','auditoria_eventos','acordo_cancelamentos'])test(`falha em ${table} reverte cancelamento, arquivo, cobrança, fila e agenda`,async()=>{
  const {db,cancelar}=await fixtureCancelamento();try{
    await db.exec(`create function fault() returns trigger language plpgsql as $$begin raise exception 'fault';end$$;create trigger fault before insert on ${table} for each row execute function fault()`);
    await assert.rejects(cancelar(),/fault/);
    assert.equal((await db.query<any>('select status from acordos')).rows[0].status,'ativo');
    assert.equal((await db.query<any>('select status_operacional from cobrancas')).rows[0].status_operacional,'acordo_firmado');
    assert.equal((await db.query('select * from acordo_documentos')).rows.length,0);assert.equal((await db.query('select * from acordo_cancelamentos')).rows.length,0);
    assert.equal((await db.query('select * from email_agenda')).rows.length,1);
  }finally{await db.close();}
});

test('pagamento e renegociação são impedimentos iguais na UI e RPC, inclusive valor parcial sem data',async()=>{
  const {db,cancelar}=await fixtureCancelamento();try{
    for(const sql of ["update acordos set status='renegociado'","update acordos set status_financeiro='parcial'","update parcelas_acordo set valor_pago=1","update parcelas_acordo set data_pagamento=current_date","update parcelas_acordo set status='paga'"]){
      await db.exec('begin');await db.exec(sql);await assert.rejects(cancelar(),/revisão/);await db.exec('rollback');
    }
    assert.ok(impedimentoCancelamento({status:'renegociado'},[]));
    assert.ok(impedimentoCancelamento({status:'ativo'},[{status:'aberta',valor_pago:1}]));
    assert.ok(impedimentoCancelamento({status:'ativo',status_financeiro:'parcial'},[]));
  }finally{await db.close();}
});

test('pagamento que chega depois do cancelamento exige conciliação; não altera recibo nem estado',async()=>{
  const {db,cancelar}=await fixtureCancelamento();try{
    await cancelar();await assert.rejects(db.exec('update parcelas_acordo set valor_pago=1,data_pagamento=current_date'),/conciliação/);
    assert.equal((await db.query<any>('select valor_pago from parcelas_acordo limit 1')).rows[0].valor_pago,null);
    assert.equal((await db.query('select * from acordo_cancelamentos')).rows.length,1);
  }finally{await db.close();}
});

test('envios incertos ou reservados bloqueiam; PDF inválido e chave alterada não gravam provas',async()=>{
  const {db,cancelar}=await fixtureCancelamento();try{
    await db.query("insert into whatsapp_web_envios values($1,'incerto')",[id(61)]);await assert.rejects(cancelar(),/incerto/);
    await db.exec('delete from whatsapp_web_envios');await assert.rejects(cancelar({pdf:Buffer.from('arquivo').toString('base64')}),/Documento/);
    assert.equal((await db.query('select * from acordo_documentos')).rows.length,0);
    await cancelar();await assert.rejects(cancelar({motivo:'Outra intenção'}),/outra intenção/);
  }finally{await db.close();}
});

test('carteira, perfil e autor restringem commit/recibo; documento privado usa autorização existente',async()=>{
  const {db,cancelar,resultado}=await fixtureCancelamento();try{
    await db.exec('set role authenticated');await assert.rejects(cancelar(),/permission denied/);await db.exec('reset role');
    await assert.rejects(cancelar({operador:id(12)}),/indisponível/);
    const r=(await cancelar()).rows[0].r;
    await assert.rejects(resultado(id(11)),/indisponível/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(10)]);
    const document=await db.query<any>('select * from acordo_baixar_documento($1)',[r.documento_id]);assert.equal(document.rows.length,1);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(12)]);
    assert.equal((await db.query('select * from acordo_baixar_documento($1)',[r.documento_id])).rows.length,0);
  }finally{await db.close();}
});

test('cobrança judicial, paga, bloqueada ou com outro acordo não é forçada à cobrança ativa',async()=>{
  const {db,cancelar}=await fixtureCancelamento();try{
    await db.exec("update unidades set acao_judicial=true;update cobrancas set status_financeiro='quitado',automacao_bloqueada=true");
    const r=(await cancelar({pdf:null})).rows[0].r;assert.equal(r.cobrancas_reativadas,0);
    const b=(await db.query<any>('select * from cobrancas')).rows[0];assert.equal(b.status_financeiro,'quitado');assert.equal(b.automacao_bloqueada,true);assert.equal(b.status_operacional,'acordo_firmado');
  }finally{await db.close();}
});
