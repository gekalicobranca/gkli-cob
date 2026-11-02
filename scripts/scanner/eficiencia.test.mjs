import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {banco} from './eficiencia-fixture.mjs'
import {loteDocumentos,diagnosticoFinanceiro} from './eficiencia.mjs'
import {evidencia} from './core.mjs'

async function fixture(){
 const f=await banco({manual:true}),{db}=f
 await db.exec(`reset role;
 alter table acordos add updated_at timestamptz default test_now();
 alter table scanner_configuracoes add retomada_prioritaria_ate timestamptz;
 create table scanner_cadastro_auditoria(evidencia_id uuid primary key,unidade_id uuid,resultado text,antes jsonb,depois jsonb,atualizado_em timestamptz default test_now());
 grant select,insert on scanner_cadastro_auditoria to service_role;`)
 for(const file of ['20261026030745_scanner_interpretacao_sugestoes.sql','20261026120743_scanner_ia_lote_extra_auditado.sql','20261102030843_scanner_foco_abertos_retomada_relatorio.sql'])
  await db.exec((await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.exec('set role service_role')
 return f
}
const pago=(extra={})=>({recibo:'999999',natureza:'cobranca',vencimento:'10/10/2026',data_pagamento:'12/10/2026',valor_original_centavos:10000,valor_pago:100,componentes_conferidos:true,...extra})
const href=(n,codigo='63004',unidade='000001')=>'https://portal.lellocondominios.com.br/relatorios/Acordo.do?codCondo='+codigo+'&codUnidade='+unidade+'&codAcordo='+n

test('Lello: mais de dez documentos são divididos e retomados sem repetir ou aceitar outro escopo',()=>{
 const links=Array.from({length:14},(_,i)=>href(i+1)),op={codigo:'63004',unidade:'000001',acordos:['12']}
 let vistos=[],lotes=0
 do{const l=loteDocumentos(links,{...op,visitados:vistos});assert.ok(l.links.length<=3);if(!lotes)assert.equal(l.links[0],href(12));assert.ok(l.links.every(x=>!vistos.includes(x)));vistos=[...l.visitados,...l.links];lotes++}while(vistos.length<links.length)
 assert.equal(lotes,5);assert.equal(new Set(vistos).size,14)
 assert.throws(()=>loteDocumentos([href(1,'99999')],op),/fora/)
 assert.throws(()=>loteDocumentos([href('invalido')],op),/inválido/)
 assert.equal(diagnosticoFinanceiro({status:'consultado',pagamentos:[]}),'sem_pagamento_localizado')
 assert.equal(diagnosticoFinanceiro({motivo:'Histórico de pagamento não disponibilizado neste acesso.'}),'sem_acesso')
})

test('SQL: pagos ficam fora da fila diária e são rechecados separadamente sem gerar baixa',async()=>{
 const {db,ids,prova,processar}=await fixture()
 try{
  await db.query("update cobrancas set status_financeiro='quitado' where id=$1",[ids.cobranca])
  await db.query("update parcelas_acordo set status='paga',data_pagamento='2026-10-12' where id=$1",[ids.parcela])
  const r=await processar(await prova([pago()]))
  assert.equal(r.itens,0);assert.equal(r.rechecagens_pagos,2);assert.equal(r.baixa.aplicadas,0)
  const check=(await db.query('select itens from scanner_rechecagens_pagos')).rows[0].itens
  assert.ok(check.every(x=>x.baixa_automatica_elegivel===false))
  assert.equal((await processar(await prova([pago()]))).rechecagens_pagos,0)
  assert.equal((await db.query('select * from scanner_baixas')).rows.length,0)
  await db.exec("update test_clock set value=value+interval '8 days'")
  assert.equal((await processar(await prova([pago()]))).rechecagens_pagos,2)
 }finally{await db.close()}
})

test('SQL: pagamento objetivo continua baixando; recibo duplicado em item pago continua bloqueando',async()=>{
 const f=await fixture(),{db,ids,prova,processar}=f
 try{
  await db.query("insert into cobrancas(id,condominio_id,carteira_id,unidade_id,valor_original,valor_atualizado,vencimento,status,status_financeiro,observacoes) values($1,$2,$3,$4,100,100,'2026-10-10','em_aberto','quitado','Recibo 999999')",[randomUUID(),ids.condo,ids.car,ids.unit])
  const r=await processar(await prova([pago()]));assert.equal(r.baixa.aplicadas,0);assert.equal(r.resumo.ambiguo,1)
  await db.exec("delete from cobrancas where status_financeiro='quitado'")
  assert.equal((await processar(await prova([pago()]))).baixa.aplicadas,1)
 }finally{await db.close()}
})

test('SQL: rechecagem de pagos alterna os itens que excedem o orçamento de cinquenta',async()=>{
 const {db,ids,prova,processar}=await fixture()
 try{
  await db.exec("update cobrancas set status_financeiro='quitado';update parcelas_acordo set status='paga',data_pagamento='2026-10-12'")
  await db.query("insert into cobrancas(id,condominio_id,carteira_id,unidade_id,valor_original,valor_atualizado,vencimento,status,status_financeiro) select gen_random_uuid(),$1,$2,$3,100,100,'2026-10-10','em_aberto','quitado' from generate_series(1,51)",[ids.condo,ids.car,ids.unit])
  assert.equal((await processar(await prova([]))).rechecagens_pagos,50)
  assert.equal((await processar(await prova([]))).rechecagens_pagos,3)
  assert.equal((await processar(await prova([]))).rechecagens_pagos,0)
  assert.equal((await db.query('select * from scanner_baixas')).rows.length,0)
 }finally{await db.close()}
})

test('SQL: IA não consome cota sem documento e reserva fonte com conteúdo e candidato em aberto',async()=>{
 const {db,ids,provaBruta,processar}=await fixture()
 try{
  const dados={codigo:'567',unidade:ids.unit,referencia_portal:'0/AP/000001',status:'inconclusivo',motivo:'Sem acesso'}
  await processar(await provaBruta(dados,ids.unit))
  const claim=async()=>(await db.query('select scanner_analise_reivindicar($1,null) r',[randomUUID()])).rows[0].r
  assert.equal(await claim(),null)
  assert.equal((await db.query('select chamadas from scanner_ia_orcamento')).rows[0].chamadas,0)
  await processar(await provaBruta({...dados,leitura_auxiliar:{tabelas:[{cabecalhos:['Recibo','Valor'],linhas:[['999999','100,00']]}]}},ids.unit))
  assert.ok((await claim()).id)
  assert.equal((await db.query('select chamadas from scanner_ia_orcamento')).rows[0].chamadas,1)
 }finally{await db.close()}
})

test('SQL: checkpoint parcial persiste documentos e mantém cursor; conclusão avança e pausa só o financeiro',async()=>{
 const {db,ids}=await fixture()
 try{
  const token=randomUUID(),unit=ids.unit
  const reservar=async()=>db.query("update scanner_controle set token=$1,configuracao_id=$2,reservado_ate=test_now()+interval '5 minutes'",[token,ids.config])
  const concluir=async(cursor,dados)=>{
   await reservar()
   const evs=[evidencia(unit,'contatos',{codigo:'567',unidade:unit,fichas:[]}),evidencia(unit,'pagamentos',{codigo:'567',unidade:unit,...dados})]
   await db.query('select scanner_concluir($1,$2,$3,false)',[token,cursor,JSON.stringify(evs)])
  }
  await db.query("update scanner_configuracoes set portal='lello' where id=$1",[ids.config])
  await concluir(0,{status:'parcial',historico_progresso:{pendente:true,visitados:[href(1)]}})
  assert.equal((await db.query('select cursor from scanner_configuracoes')).rows[0].cursor,0)
  assert.deepEqual((await db.query('select visitados from scanner_historicos')).rows[0].visitados,[href(1)])
  assert.equal((await db.query('select observacoes from scanner_lotes')).rows[0].observacoes[0].parcial,true)
  // Outro token representa o próximo lote; o anterior não pode ser contado novamente.
  const next=randomUUID()
  await db.query("update scanner_controle set token=$1,configuracao_id=$2,reservado_ate=test_now()+interval '5 minutes'",[next,ids.config])
  await db.query('select scanner_concluir($1,1,$2,false)',[next,JSON.stringify([evidencia(unit,'contatos',{fichas:[]}),evidencia(unit,'pagamentos',{diagnostico:'sem_acesso',historico_progresso:{pendente:false,visitados:[href(1)]}})])])
  assert.equal((await db.query('select * from scanner_historicos')).rows.length,0)
  const cfg=(await db.query('select * from scanner_configuracoes')).rows[0]
  assert.equal(cfg.financeiro_falhas,1);assert.equal(cfg.ativo,true)
  assert.equal(new Date(cfg.financeiro_proxima_tentativa)-new Date((await db.query('select test_now() n')).rows[0].n),6*3600000)
  assert.equal((await db.query("select has_table_privilege('authenticated','scanner_lotes','insert') p")).rows[0].p,false)
  assert.equal((await db.query("select has_table_privilege('service_role','scanner_lotes','update') p")).rows[0].p,false)
 }finally{await db.close()}
})

test('SQL: resumo usa data da alteração cadastral e separa preenchimento, correção e formato',async()=>{
 const {db,ids}=await fixture()
 try{
  await db.query("insert into scanner_cadastro_auditoria(evidencia_id,unidade_id,resultado,antes,depois,atualizado_em) values($1,$2,'atualizado',$3,$4,'2026-10-24 04:00Z')",[randomUUID(),ids.unit,JSON.stringify({unidade:{email:''}}),JSON.stringify({unidade:{email:'antigo@exemplo.com'}})])
  await db.query("insert into scanner_cadastro_auditoria(evidencia_id,unidade_id,resultado,antes,depois) values($1,$2,'atualizado',$3,$4)",[randomUUID(),ids.unit,JSON.stringify({unidade:{email:'',telefone:'(11) 99999-0000',responsavel_nome:'Ana'}}),JSON.stringify({unidade:{email:'novo@exemplo.com',telefone:'11999990000',responsavel_nome:'Maria'}})])
  const r=(await db.query("select scanner_resumo_dia('2026-10-25') r")).rows[0].r
  assert.equal(r.cadastros_atualizados,1);assert.equal(r.campos_preenchidos,1);assert.equal(r.campos_formatados,1);assert.equal(r.campos_corrigidos,1)
 }finally{await db.close()}
})
