import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {fixture} from './conciliacao-fixture.mjs'

async function banco({manual=false}={}){
 const f=await fixture({bbzVinculos:true}),{db,ids}=f
 await db.exec(`reset role;
 alter table unidades add acao_judicial boolean default false;
 alter table acordos add cobranca_id uuid,add status text default 'ativo',add tipo text default 'extrajudicial',add status_financeiro text default 'em_aberto',add possui_entrada boolean default false,add valor_entrada numeric default 0,add data_quitacao date;
 alter table parcelas_acordo add tipo_parcela text default 'parcela';
 alter table cobrancas add status_financeiro text default 'em_aberto',add status_operacional text default 'novo',add automacao_bloqueada boolean default false;
 create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
 create table central_pendencias(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,status text,payload jsonb);
 create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,usuario_id uuid,usuario_nome text,antes jsonb,depois jsonb);
 create table timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,severidade text,condominio_id uuid,unidade_id uuid,cobranca_id uuid,acordo_id uuid,origem text,usuario_id uuid,usuario_nome text,payload jsonb);
 create table mensagens(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,status text,payload jsonb);
 create function flow_cancelar_mensagem(mid uuid) returns void language sql as $$update mensagens set status='cancelada' where id=mid and status in ('agendada','aprovada')$$;
 create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at:=public.test_now();return new;end$$;
 create trigger updated before update on parcelas_acordo for each row execute function set_updated_at();
 create trigger updated before update on cobrancas for each row execute function set_updated_at();
 grant all on all tables in schema public to service_role;`)
 await db.exec((await readFile(new URL('../../supabase/migrations/20261025132645_scanner_baixa_auditada_pagamentos.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261025132800_scanner_baixas_historico_append.sql',import.meta.url),'utf8'))
 if(manual)await db.exec((await readFile(new URL('../../supabase/migrations/20261025200042_scanner_lote_manual_limitado.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.query("update acordos set quantidade_parcelas=1,valor_acordado=100,observacoes='[BBZ:01380:12345678]'")
 await db.query("update scanner_configuracoes set portal='manager',codigo_portal='567',unidades=array[$1]",[ids.unit])
 await db.exec('set role service_role')
 const fonte=pagamentos=>({codigo:'567',unidade:ids.unit,referencia_portal:'0/AP/000001',fonte:'https://atentum-s9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'consultado',pagamentos})
 const prova=async pagamentos=>f.prova(fonte(pagamentos),ids.unit)
 const execucao=randomUUID()
 const processar=async id=>(await db.query('select scanner_processar_pagamentos($1,$2) r',[id,execucao])).rows[0].r
 return {...f,prova,provaBruta:f.prova,processar,execucao}
}
const pago=(overrides={})=>({recibo:'999999',natureza:'cobranca',vencimento:'10/10/2026',data_pagamento:'12/10/2026',valor_original_centavos:10000,valor_pago:100,componentes_conferidos:true,...overrides})

test('lote manual diurno exige autorização única, coleta nova e encerramento',async()=>{
 const {db,ids,prova,execucao,processar}=await banco({manual:true})
 try{
  await db.exec("update test_clock set value='2026-10-25 15:00Z'")
  const anterior=await prova([pago()])
  assert.equal((await processar(anterior)).baixa.resultado,'fora_da_janela')
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
  await db.exec('reset role')
  await db.query("insert into scanner_lotes_manuais(token,configuracao_id,expira_em,motivo) values($1,$2,test_now()+interval '10 minutes','Teste solicitado explicitamente no chat')",[execucao,ids.config])
  await db.exec('set role service_role')
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[execucao])).rows.length,1)
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[execucao])).rows.length,0)
  assert.equal((await db.query("select has_table_privilege('service_role','scanner_lotes_manuais','insert') pode")).rows[0].pode,false)
  await db.exec("update test_clock set value=value+interval '1 minute'")
  const nova=await prova([pago()]);assert.equal((await processar(nova)).baixa.aplicadas,1)
  await db.query('update scanner_lotes_manuais set encerrado_em=test_now() where token=$1',[execucao])
  const outra=await prova([pago({recibo:'888888'})]);assert.equal((await processar(outra)).baixa.resultado,'fora_da_janela')
 }finally{await db.close()}
})

test('baixa de cobrança preserva data efetiva, identifica scanner/execução, cancela lembrete e é idempotente',async()=>{
 const {db,ids,prova,processar,execucao}=await banco()
 try{
  await db.query("insert into mensagens(carteira_id,cobranca_id,status,payload) values($1,$2,'agendada','{}')",[ids.car,ids.cobranca])
  const e=await prova([pago()]),r=await processar(e);assert.equal(r.baixa.aplicadas,1)
  const c=(await db.query('select * from cobrancas where id=$1',[ids.cobranca])).rows[0]
  assert.equal(c.status_financeiro,'quitado');assert.equal(c.automacao_bloqueada,true);assert.equal(new Date(c.data_pagamento).toISOString().slice(0,10),'2026-10-12');assert.equal(Number(c.valor_pago),100)
  const baixa=(await db.query('select * from scanner_baixas')).rows[0]
  assert.equal((await db.query("select has_table_privilege('service_role','scanner_baixas','update') pode")).rows[0].pode,false);assert.equal((await db.query("select has_table_privilege('service_role','scanner_baixas','delete') pode")).rows[0].pode,false);
  assert.equal(baixa.confirmado_por,'scanner_noturno');assert.equal(baixa.operador_portal,null);assert.equal(baixa.execucao_id,execucao);assert.equal(baixa.evidencia_id,e)
  assert.equal((await db.query('select usuario_nome from auditoria_eventos')).rows[0].usuario_nome,'Scanner noturno')
  assert.equal((await db.query('select status from mensagens')).rows[0].status,'cancelada')
  await processar(e);await processar(await prova([pago()]))
  assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from auditoria_eventos')).rows[0].n,1)
 }finally{await db.close()}
})

test('parcela quitada atualiza acordo completo e estados vinculados, sem baixar a cobrança original novamente',async()=>{
 const {db,ids,prova,processar}=await banco()
 try{
  await db.query('insert into acordo_cobrancas values($1,$2)',[ids.acordo,ids.cobranca])
  await db.query("update parcelas_acordo set observacoes='Recibo 888888'")
  const r=await processar(await prova([pago({recibo:'888888',natureza:'parcela_acordo',numero_parcela:1})]));assert.equal(r.baixa.aplicadas,1)
  const p=(await db.query('select * from parcelas_acordo')).rows[0],a=(await db.query('select * from acordos')).rows[0],c=(await db.query('select * from cobrancas')).rows[0]
  assert.equal(p.status,'paga');assert.equal(new Date(p.data_pagamento).toISOString().slice(0,10),'2026-10-12');assert.equal(a.status,'quitado');assert.equal(new Date(a.data_quitacao).toISOString().slice(0,10),'2026-10-12')
  assert.equal(c.status_operacional,'acordo_efetivado');assert.equal(c.status_financeiro,'em_aberto')
  assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,1)
 }finally{await db.close()}
})

test('grade incompleta não quita o acordo; parcial, ambiguidade e data futura não fazem baixa',async()=>{
 const {db,prova,processar}=await banco()
 try{
  for(const pagamento of [pago({valor_pago:50}),pago({data_pagamento:'2040-10-12'})])assert.equal((await processar(await prova([pagamento]))).baixa.aplicadas,0)
  assert.equal((await processar(await prova([pago(),pago()]))).baixa.aplicadas,0)
  await db.query("update parcelas_acordo set observacoes='Recibo 888888'")
  await db.query('update acordos set quantidade_parcelas=2,valor_acordado=200')
  const r=await processar(await prova([pago({recibo:'888888',natureza:'parcela_acordo',numero_parcela:1})]));assert.equal(r.baixa.aplicadas,1)
  assert.equal((await db.query('select status,status_financeiro from acordos')).rows[0].status_financeiro,'parcial')
  assert.notEqual((await db.query('select status from acordos')).rows[0].status,'quitado')
 }finally{await db.close()}
})

test('pagamento preexistente preserva autoria e data; bloqueios humanos/judiciais impedem baixa',async()=>{
 for(const bloqueio of ['judicial','humano','preexistente']){
  const {db,ids,prova,processar}=await banco()
  try{
   if(bloqueio==='judicial')await db.exec('update unidades set acao_judicial=true')
   if(bloqueio==='humano')await db.query("insert into central_pendencias(carteira_id,condominio_id,unidade_id,status,payload) values($1,$2,$3,'em_tratamento','{\"estado\":\"atendimento_humano\"}')",[ids.car,ids.condo,ids.unit])
   if(bloqueio==='preexistente')await db.exec("update cobrancas set status_financeiro='quitado',data_pagamento='2026-10-12'")
   const r=await processar(await prova([pago()]));assert.equal(r.baixa.aplicadas,0)
   assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,0)
  }finally{await db.close()}
 }
})

test('falha na auditoria desfaz baixa e eventos; evidência permanece pendente para retomada',async()=>{
 const {db,prova,processar}=await banco()
 try{
  await db.exec(`reset role;create function falhar() returns trigger language plpgsql as $$begin raise exception 'auditoria indisponivel';end$$;create trigger falhar before insert on auditoria_eventos for each row execute function falhar();set role service_role`)
  const e=await prova([pago()]);await assert.rejects(processar(e),/auditoria indisponivel/)
  assert.equal((await db.query('select status_financeiro from cobrancas')).rows[0].status_financeiro,'em_aberto')
  assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from scanner_conciliacao_auditoria')).rows[0].n,0)
  assert.equal((await db.query('select conciliacao_status from scanner_evidencias where id=$1',[e])).rows[0].conciliacao_status,'pendente')
 }finally{await db.close()}
})

test('janela e permissões: fora da noite e usuários autenticados não aplicam baixa',async()=>{
 const {db,prova,processar}=await banco()
 try{
  await db.exec("update test_clock set value='2026-10-25 14:00Z'")
  const e=await prova([pago()]);assert.equal((await processar(e)).baixa.resultado,'fora_da_janela')
  assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,0)
  await db.exec('reset role;set role authenticated')
  assert.equal((await db.query('select * from scanner_baixas')).rows.length,0)
  await assert.rejects(processar(e),/permission denied/)
  await assert.rejects(db.query('select scanner_aplicar_baixas($1)',[randomUUID()]),/permission denied/)
 }finally{await db.close()}
})

test('alteração entre conferência e aplicação impede baixa; reabertura manual posterior não é sobrescrita',async()=>{
 const {db,prova,processar}=await banco()
 try{
  await db.exec(`reset role;create function alterar() returns trigger language plpgsql as $$begin update cobrancas set valor_original=101;return new;end$$;create trigger alterar before insert on scanner_conciliacao_auditoria for each row execute function alterar();set role service_role`)
  let r=await processar(await prova([pago()]));assert.equal(r.baixa.aplicadas,0);assert.equal(r.baixa.revisoes,1)
  await db.exec('reset role;drop trigger alterar on scanner_conciliacao_auditoria;set role service_role;update cobrancas set valor_original=100')
  r=await processar(await prova([pago()]));assert.equal(r.baixa.aplicadas,1)
  await db.exec("update cobrancas set status_financeiro='em_aberto',data_pagamento=null,automacao_bloqueada=false")
  r=await processar(await prova([pago()]));assert.equal(r.baixa.aplicadas,0);assert.equal(r.baixa.revisoes,1)
  assert.equal((await db.query('select status_financeiro from cobrancas')).rows[0].status_financeiro,'em_aberto')
  assert.equal((await db.query('select count(*)::int n from scanner_baixas')).rows[0].n,1)
 }finally{await db.close()}
})

test('Lello: resumo sem recibo exige revisão; recebimento detalhado com vínculo único faz baixa',async()=>{
 const {db,ids,provaBruta,processar}=await banco()
 try{
  await db.exec("update scanner_configuracoes set portal='lello',codigo_portal='63004',unidades=array['000001']")
  const url='https://portal.lellocondominios.com.br/relatorios/Acordo.do?codCondo=63004&codUnidade=000001&codAcordo=123'
  const payload=recebimentos=>({codigo:'63004',unidade:'000001',recebimentos})
  const resumo={tipo:'acordo',acordo_externo:'123',unidade:'000001',fonte:url,total_centavos:10000,pago_centavos:10000,saldo_centavos:0,parcelas:[{vencimento:'2026-10-10',valor_centavos:10000,status:'Contabilizado',data_pagamento:'2026-10-12'}]}
  let r=await processar(await provaBruta(payload([resumo])));assert.equal(r.resumo.validado,1);assert.equal(r.baixa.aplicadas,0);assert.equal(r.baixa.revisoes,1)
  const detalhe={tipo:'recebimento',acordo_externo:'123',unidade:'000001',fonte:url+'&numrecibo=777',recibo_consultado:'777',numero:1,vencimento:'2026-10-10',valor_original_centavos:10000,valor_pago_centavos:10000,status:'Contabilizado',confirmado_na_fonte:true,data_pagamento:'2026-10-12'}
  r=await processar(await provaBruta(payload([detalhe])));assert.equal(r.baixa.aplicadas,1)
  assert.equal((await db.query('select portal from scanner_baixas where parcela_id=$1',[ids.parcela])).rows[0].portal,'lello')
 }finally{await db.close()}
})

test('BBZ: parcela com recibo auditado baixa somente quando a grade explicita recebimento integral',async()=>{
 const {db,ids,provaBruta,processar}=await banco()
 try{
  await db.exec("update condominios set administradora='BBZ'")
  await db.query("insert into agente_acordos_configuracoes values($1,'01380','BBZ')",[ids.condo])
  await db.query("update scanner_configuracoes set portal='bbz',codigo_portal='0',unidades=array[$1]",[ids.unit])
  const prova={versao:1,referencia:'0/AP/000001',consultado_em:'2026-10-25T04:00:00Z',sha256:'a'.repeat(64),fonte_grade:'https://servc9.webware.com.br/bin/rt/gAcordo.asp?u=0/AP/000001',fonte_boletos:'https://portalwm.webware.com.br/relatorioboleto/recibos',baixa_permitida:false,boletos:[{recibo:'888888',numero:1,quantidade:1,vencimento:'2026-10-10',valor:10000}],processos:[{processo:'12345678',quantidade:1,completa:true,parcelas:[{numero:1,vencimento:'2026-10-10',valor:10000,recebido:0,data_recebimento:null}]}]}
  const payload=()=>({codigo:'0',unidade:ids.unit,referencia_portal:'0/AP/000001',fonte:'https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'inconclusivo',pagamentos:[],vinculos_bbz:prova})
  let r=await processar(await provaBruta(payload(),ids.unit));assert.equal(r.baixa.aplicadas,0)
  prova.processos[0].parcelas[0].recebido=10000;prova.processos[0].parcelas[0].data_recebimento='2026-10-12'
  r=await processar(await provaBruta(payload(),ids.unit));assert.equal(r.baixa.aplicadas,1)
  assert.equal((await db.query('select portal from scanner_baixas')).rows[0].portal,'bbz')
 }finally{await db.close()}
})
