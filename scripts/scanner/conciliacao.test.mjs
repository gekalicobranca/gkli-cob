import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {fixture} from './conciliacao-fixture.mjs'
import {evidencia} from './core.mjs'

const url='https://portal.lellocondominios.com.br/relatorios/Acordo.do?codCondo=63004&codUnidade=000001&codAcordo=123'
const resumo=()=>({tipo:'acordo',acordo_externo:'123',unidade:'000001',fonte:url,total_centavos:10000,pago_centavos:10000,saldo_centavos:0,parcelas:[{vencimento:'2026-10-10',valor_centavos:10000,status:'Contabilizado',data_pagamento:'2026-10-12'}]})
const detalhe=()=>({tipo:'recebimento',acordo_externo:'123',unidade:'000001',fonte:url+'&numrecibo=777',recibo_consultado:'777',numero:1,vencimento:'2026-10-10',valor_original_centavos:10000,valor_pago_centavos:10000,status:'Contabilizado',confirmado_na_fonte:true,data_pagamento:'2026-10-12'})
const payload=recebimentos=>({codigo:'63004',unidade:'000001',recebimentos})

test('Lello: vínculo externo, detalhe/resumo, parcial, divergência, duplicidade, data e não propagação para cobranças',async()=>{
 const f=await fixture(),{db,ids,prova,aplicar}=f
 try{
  let id=await prova(payload([resumo()])),r=await aplicar(id)
  assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'validado')
  assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'inconclusivo')
  assert.equal(r.itens[0].baixa_permitida,false)
  await aplicar(id);assert.equal((await db.query('select count(*)::int n from scanner_conciliacao_auditoria where evidencia_id=$1',[id])).rows[0].n,1)
  r=await aplicar(await prova(payload([resumo(),detalhe()])));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'validado')
  const parcial=detalhe();parcial.valor_pago_centavos=5000
  r=await aplicar(await prova(payload([parcial])));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'divergente')
  const fut=detalhe();fut.data_pagamento='2040-01-01'
  r=await aplicar(await prova(payload([fut])));assert.equal(r.r.resultado,'fonte_inconclusiva');assert.ok(r.itens.every(x=>x.resultado!=='validado'))
  const duplicado=resumo();duplicado.parcelas.push({...duplicado.parcelas[0]});duplicado.total_centavos=20000;duplicado.pago_centavos=20000
  r=await aplicar(await prova(payload([duplicado])));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'ambiguo')
  await db.query("update parcelas_acordo set data_pagamento='2026-10-11' where id=$1",[ids.parcela])
  r=await aplicar(await prova(payload([detalhe()])));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'divergente')
  await db.query('update acordos_fontes_lello set numero_acordo=$1',['456'])
  r=await aplicar(await prova(payload([resumo()])));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'inconclusivo')
 }finally{await db.close()}
})

test('BBZ: vínculo auditado exige grade integral/processo único, não paga e habilita conciliação apenas com recebimento explícito',async()=>{
 const {db,ids,prova,aplicar}=await fixture({bbzVinculos:true})
 try{
  await db.query("update condominios set administradora='BBZ'")
  await db.query("insert into agente_acordos_configuracoes values($1,'01380','BBZ')",[ids.condo])
  await db.query("update acordos set observacoes='[BBZ:01380:12345678]',quantidade_parcelas=1,valor_acordado=100")
  await db.query("update scanner_configuracoes set portal='bbz',codigo_portal='0',unidades=array[$1]",[ids.unit])
  const parcela={numero:1,vencimento:'2026-10-10',valor:10000,recebido:0,data_recebimento:null}
  const fonte={versao:1,referencia:'0/AP/000001',consultado_em:'2026-10-25T04:00:00Z',sha256:'a'.repeat(64),fonte_grade:'https://servc9.webware.com.br/bin/rt/gAcordo.asp?u=0/AP/000001',fonte_boletos:'https://portalwm.webware.com.br/relatorioboleto/recibos',baixa_permitida:false,boletos:[{recibo:'888888',numero:1,quantidade:1,vencimento:'2026-10-10',valor:10000}],processos:[{processo:'12345678',quantidade:1,completa:true,parcelas:[parcela]}]}
  const vincular=async f=>(await db.query('select scanner_bbz_vincular_recibos($1,$2,$3) r',[ids.condo,ids.unit,JSON.stringify(f)])).rows[0].r
  const financeiro=async()=>JSON.stringify((await db.query('select to_jsonb(a) a,to_jsonb(p) p from acordos a join parcelas_acordo p on p.acordo_id=a.id')).rows)
  const antes=await financeiro()
  let r=await vincular({...fonte,processos:[{...fonte.processos[0],completa:false}]});assert.equal(r.itens[0].resultado,'revisao')
  r=await vincular({...fonte,processos:[...fonte.processos,{...fonte.processos[0],processo:'87654321'}]});assert.equal(r.itens[0].resultado,'ambiguo')
  await db.query("update acordos set observacoes='[BBZ:01380:12345678] [BBZ:01380:87654321]'")
  r=await vincular(fonte);assert.equal(r.itens[0].resultado,'revisao')
  await db.query("update acordos set observacoes='[BBZ:01380:12345678]'")
  r=await vincular(fonte);assert.equal(r.itens[0].resultado,'vinculado')
  assert.equal(await financeiro(),antes,'vincular nunca altera acordo nem parcela')
  r=await vincular(fonte);assert.equal(r.itens[0].resultado,'reutilizado')
  const evidencia=pagamentos=>({codigo:'0',unidade:ids.unit,referencia_portal:'0/AP/000001',fonte:'https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'consultado',pagamentos})
  let conc=await aplicar(await prova(evidencia([]),ids.unit));assert.equal(conc.itens.find(p=>p.id===ids.parcela).resultado,'inconclusivo')
  const pago={recibo:'888888',natureza:'parcela_acordo',numero_parcela:1,vencimento:'10/10/2026',data_pagamento:'12/10/2026',valor_original_centavos:10000,valor_pago:100,componentes_conferidos:true}
  conc=await aplicar(await prova(evidencia([pago]),ids.unit));assert.equal(conc.itens.find(p=>p.id===ids.parcela).resultado,'validado')
  const gradePaga=structuredClone(fonte);gradePaga.processos[0].parcelas[0].recebido=10000;gradePaga.processos[0].parcelas[0].data_recebimento='2026-10-12'
  conc=await aplicar(await prova({...evidencia([]),status:'inconclusivo',vinculos_bbz:gradePaga},ids.unit));assert.equal(conc.itens.find(p=>p.id===ids.parcela).resultado,'validado','grade tem recebimento explícito e recibo previamente vinculado')
  gradePaga.processos[0].parcelas[0].recebido=5000
  conc=await aplicar(await prova({...evidencia([]),vinculos_bbz:gradePaga},ids.unit));assert.equal(conc.itens.find(p=>p.id===ids.parcela).resultado,'divergente')
  await db.query('update parcelas_acordo set valor=99 where id=$1',[ids.parcela])
  assert.equal((await db.query('select scanner_bbz_recibo_parcela($1) r',[ids.parcela])).rows[0].r,null)
  await db.exec('reset role;set role authenticated')
  assert.equal((await db.query('select * from scanner_bbz_recibos_parcelas')).rows.length,0)
  await assert.rejects(db.query('select scanner_bbz_vincular_recibos($1,$2,$3)',[ids.condo,ids.unit,JSON.stringify(fonte)]),/permission denied/)
 }finally{await db.close()}
})

test('Manager: recibo/natureza, valor atualizado, parcelas, duplicidade e ausência não validam por aproximação',async()=>{
 const {db,ids,prova,aplicar}=await fixture()
 try{
  await db.query("update scanner_configuracoes set portal='manager',codigo_portal='567',unidades=array[$1]",[ids.unit])
  const pagamento={recibo:'999999',natureza:'cobranca',vencimento:'10/10/2026',data_pagamento:'12/10/2026',valor_original_centavos:10000,valor_pago:100,componentes_conferidos:true}
  const fonte=pagamentos=>({codigo:'567',unidade:ids.unit,referencia_portal:'0/AP/1',fonte:'https://atentum-s9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'consultado',pagamentos})
  let r=await aplicar(await prova(fonte([pagamento]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'validado')
  await db.query('update cobrancas set valor_atualizado=110 where id=$1',[ids.cobranca])
  r=await aplicar(await prova(fonte([{...pagamento,valor_pago:110}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'validado')
  r=await aplicar(await prova(fonte([{...pagamento,natureza:'indefinida'}]),ids.unit));assert.ok(r.itens.every(x=>x.resultado!=='validado'))
  await db.query("update parcelas_acordo set observacoes='Recibo 888888' where id=$1",[ids.parcela])
  r=await aplicar(await prova(fonte([{...pagamento,recibo:'888888',natureza:'parcela_acordo',numero_parcela:1}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'validado')
  r=await aplicar(await prova(fonte([{...pagamento,recibo:'888888',natureza:'parcela_acordo',numero_parcela:2}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'divergente')
  await db.query("insert into cobrancas(id,condominio_id,carteira_id,unidade_id,valor_original,valor_atualizado,vencimento,status,observacoes) values($1,$2,$3,$4,100,110,'2026-10-10','em_aberto','Recibo 999999')",[randomUUID(),ids.condo,ids.car,ids.unit])
  r=await aplicar(await prova(fonte([pagamento]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'ambiguo')
 }finally{await db.close()}
})

test('BBZ: recibo/natureza, valor atualizado, parcelas, duplicidade e ausência não validam por aproximação',async()=>{
 const {db,ids,prova,aplicar}=await fixture()
 try{
  await db.query("update scanner_configuracoes set portal='bbz',codigo_portal='567',unidades=array[$1]",[ids.unit])
  const pagamento={recibo:'999999',natureza:'cobranca',vencimento:'10/10/2026',data_pagamento:'12/10/2026',valor_original_centavos:10000,valor_pago:100,componentes_conferidos:true}
  const fonte=pagamentos=>({codigo:'567',unidade:ids.unit,referencia_portal:'0/AP/1',fonte:'https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'consultado',pagamentos})
  let r=await aplicar(await prova(fonte([pagamento]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'validado')
  await db.query('update cobrancas set valor_atualizado=110 where id=$1',[ids.cobranca])
  r=await aplicar(await prova(fonte([{...pagamento,valor_pago:110}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'validado')
  r=await aplicar(await prova(fonte([{...pagamento,natureza:'indefinida'}]),ids.unit));assert.ok(r.itens.every(x=>x.resultado!=='validado'))
  await db.query("update parcelas_acordo set observacoes='Recibo 888888' where id=$1",[ids.parcela])
  r=await aplicar(await prova(fonte([{...pagamento,recibo:'888888',natureza:'parcela_acordo',numero_parcela:1}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'validado')
  r=await aplicar(await prova(fonte([{...pagamento,recibo:'888888',natureza:'parcela_acordo',numero_parcela:2}]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.parcela).resultado,'divergente')
  await db.query("insert into cobrancas(id,condominio_id,carteira_id,unidade_id,valor_original,valor_atualizado,vencimento,status,observacoes) values($1,$2,$3,$4,100,110,'2026-10-10','em_aberto','Recibo 999999')",[randomUUID(),ids.condo,ids.car,ids.unit])
  r=await aplicar(await prova(fonte([pagamento]),ids.unit));assert.equal(r.itens.find(x=>x.id===ids.cobranca).resultado,'ambiguo')
 }finally{await db.close()}
})

test('Escopo, idade, nova observação com mesmo hash e permissões preservam segurança e retomada',async()=>{
 const {db,ids,prova,aplicar}=await fixture()
 try{
  let id=await prova({...payload([resumo()]),codigo:'1'}),r=await aplicar(id);assert.equal(r.r.resultado,'revisao_escopo')
  id=await prova(payload([resumo()]));await db.exec("update test_clock set value=value+interval '2 days'")
  r=await aplicar(id);assert.equal(r.r.resultado,'evidencia_antiga')
  id=await prova(payload([detalhe()]));await aplicar(id)
  const antes=(await db.query('select observado_em from scanner_evidencias where id=$1',[id])).rows[0].observado_em
  await db.exec("update test_clock set value=value+interval '1 minute'")
  const token=randomUUID();await db.query("update scanner_controle set token=$1,configuracao_id=$2,reservado_ate=test_now()+interval '5 minutes'",[token,ids.config])
  const ev=evidencia('000001','pagamentos',payload([detalhe()]));await db.query('select scanner_concluir($1,1,$2,false)',[token,JSON.stringify([ev,evidencia('000001','contatos',{})])])
  const atualizado=(await db.query('select observado_em,conciliacao_status from scanner_evidencias where id=$1',[id])).rows[0]
  assert.notEqual(atualizado.observado_em,antes);assert.equal(atualizado.conciliacao_status,'pendente')
  await aplicar(id);assert.equal((await db.query('select count(*)::int n from scanner_conciliacao_auditoria where evidencia_id=$1',[id])).rows[0].n,2)
  await db.exec('reset role;set role authenticated')
  assert.equal((await db.query('select * from scanner_conciliacao_auditoria')).rows.length,0)
  await assert.rejects(db.query('select scanner_conciliar_pagamentos($1)',[id]),/permission denied/)
 }finally{await db.close()}
})


test('SQL: aceita vinte unidades e quarenta evidências, recusa vinte e uma',async()=>{
 const {db,ids}=await fixture()
 try{
  const unidades=Array.from({length:21},(_,i)=>String(i).padStart(6,'0')),token=randomUUID()
  await db.query('update scanner_configuracoes set unidades=$1,cursor=0 where id=$2',[unidades,ids.config])
  await db.query("update scanner_controle set token=$1,configuracao_id=$2,reservado_ate=test_now()+interval '5 minutes'",[token,ids.config])
  const es=unidades.flatMap(u=>[evidencia(u,'contatos',{}),evidencia(u,'pagamentos',{})])
  await assert.rejects(db.query('select scanner_concluir($1,21,$2,false)',[token,JSON.stringify(es)]),/Lote inválido/)
  await db.query('select scanner_concluir($1,20,$2,false)',[token,JSON.stringify(es.slice(0,40))])
  assert.equal((await db.query('select cursor from scanner_configuracoes where id=$1',[ids.config])).rows[0].cursor,20)
  assert.equal((await db.query('select count(*)::int n from scanner_evidencias')).rows[0].n,40)
  assert.equal((await db.query("select proxima_execucao=test_now()+interval '15 minutes' pausa from scanner_controle")).rows[0].pausa,true)
 }finally{await db.close()}
})
