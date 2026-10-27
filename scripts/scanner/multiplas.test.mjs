import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {selecionarUnidade,fichaManager,fichaWebware} from './portais.mjs'
import {validarConfiguracao,evidencia} from './core.mjs'
import {pagamentosManager,complementarComPagamentos} from './manager-pagamentos.mjs'
import {requisicaoDaUnidade} from './webware.mjs'

test('timeout financeiro preserva cadastro validado e desabilita a consulta no restante do lote',async()=>{
 const contatos={codigo:'567',unidade:randomUUID(),fichas:[{Nome:'Pessoa'}]};let desabilitado=false
 const r=await complementarComPagamentos(contatos,async()=>{throw Error('Timeout')},()=>{desabilitado=true})
 assert.equal(r.contatos,contatos);assert.equal(r.pagamentos.status,'inconclusivo');assert.equal(r.pagamentos.baixa_permitida,false);assert.equal(desabilitado,true)
 const ok=await complementarComPagamentos(contatos,async()=>({status:'consultado',pagamentos:[{valor_pago:100}]}),()=>assert.fail('não deveria desabilitar'))
 assert.equal(ok.pagamentos.pagamentos[0].valor_pago,100);assert.equal(ok.pagamentos.baixa_permitida,false)
})

test('resposta Webware precisa corresponder à unidade solicitada, não ao condomínio ou outra requisição',()=>{
 const request=(url,body=null)=>({url:()=>url,postData:()=>body})
 assert.equal(requisicaoDaUnidade(request('https://icondominio.webware.com.br/Unidade/Dados?unidade=123'),'123'),true)
 assert.equal(requisicaoDaUnidade(request('https://icondominio.webware.com.br/Unidade/Dados?condominio=123&unidade=456'),'123'),false)
 assert.equal(requisicaoDaUnidade(request('https://icondominio.webware.com.br/Unidade/Dados','unidade=A%2FAP%2F000001'),'A/AP/000001'),true)
 assert.equal(requisicaoDaUnidade(request('https://icondominio.webware.com.br/Unidade/Dados',JSON.stringify({dados:{unidade:'1'}})),'1'),true)
})

test('pagamentos são evidências explícitas, nunca conclusão pela ausência de recibos',()=>{
 const tabela=[['Recibo','Data Pagamento','Valor Pago'],['123456','10/10/2026'],['','100,00','11/10/2026','0,00','0,00','0,00','0,00','100,00']]
 assert.equal(pagamentosManager([tabela],'A/AP/1','Unidade: A/AP/1').pagamentos[0].valor_pago,100)
 assert.throws(()=>pagamentosManager([tabela],'A/AP/2','Unidade: A/AP/1'))
 assert.equal(pagamentosManager([tabela.slice(0,1)],'A/AP/1','Unidade: A/AP/1').status,'inconclusivo')
 assert.equal(pagamentosManager([tabela.slice(0,2)],'A/AP/1','Unidade: A/AP/1').status,'inconclusivo')
})

test('vínculo exige bloco, unidade e uma única opção, sem adivinhar zeros ou tipos',()=>{
 const ops=[{label:'A/AP/000101',value:'a'},{label:'B/AP/000101',value:'b'}]
 assert.equal(selecionarUnidade(ops,{bloco:'A',identificacao:'101'}).value,'a')
 assert.throws(()=>selecionarUnidade(ops,{bloco:'',identificacao:'101'}))
 assert.throws(()=>selecionarUnidade([...ops,ops[0]],{bloco:'A',identificacao:'101'}))
 assert.throws(()=>selecionarUnidade([{label:'A/LJ/000101',value:'1'},{label:'A/AP/000101',value:'2'}],{bloco:'A',identificacao:'101'}))
 const id=randomUUID();assert.deepEqual(validarConfiguracao({portal:'manager',codigo_portal:'567',perfil_acesso:'MANAGER',unidades:[id],cursor:0}),[id])
 assert.throws(()=>validarConfiguracao({portal:'lello',codigo_portal:'567',perfil_acesso:'MANAGER',unidades:[id],cursor:0}))
})
test('extrai somente proprietário da unidade confirmada',()=>{
 assert.throws(()=>fichaManager({iUND:'A/AP/1',ucNomeProp:'Pessoa'},'id','B/AP/1'))
 assert.equal(fichaManager({iUND:'A/AP/1',ucNomeProp:'Pessoa',ucPcelddd:'11',ucPcel:'999998888',ucQemail:'terceiro@example.com'},'id','A/AP/1').Email,'')
 assert.equal(fichaWebware('Transações\nNome: Pessoa\nE-mail: pessoa@example.com\nPrincipal\nLocatário','id').Nome,'Pessoa')
 assert.throws(()=>fichaWebware('Transações\nNome: Um\nNome: Outro','id'))
})

test('SQL multiaministradoras: inclusão, escopo de receita, pausa, inativos e UUID com bloco',async()=>{
 const db=new PGlite(),clock="timestamptz '2026-10-23 04:00Z'"
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table condominios(id uuid primary key,carteira_id uuid,status text,administradora text);
  create table agente_receitas(id uuid primary key,carteira_id uuid,script_key text,config_json jsonb,ativo boolean,updated_at timestamptz default now());
  create table unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,identificacao text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,email text,updated_at timestamptz default now());
  create table responsaveis_unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,celular text,telefone_fixo text,telefone_outros text,email text,ativo boolean default true,updated_at timestamptz default now());
  grant all on condominios,agente_receitas,unidades,responsaveis_unidades to service_role;
  create function current_user_is_admin() returns boolean language sql as 'select false';`)
  for(const f of ['20261020121015_scanner_enriquecimento_noturno.sql','20261022123307_scanner_cadastros_auditados.sql'])await db.exec((await readFile(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8')).replaceAll('now()',clock))
  const car=randomUUID(),manager=randomUUID(),outro=randomUUID(),inativo=randomUUID(),unit=randomUUID(),rid=randomUUID()
  await db.query("insert into condominios values($1,$4,'ativo','MANAGER'),($2,$4,'ativo','Habitacional'),($3,$4,'inativo','Manager')",[manager,outro,inativo,car])
  await db.query("insert into unidades(id,condominio_id,carteira_id,identificacao,bloco,responsavel_nome) values($1,$2,$3,'101','B','Pessoa Antiga')",[unit,manager,car])
  await db.query("insert into agente_receitas values($1,$2,'manager_atentum_cotas_pendentes',$3,true,now())",[rid,car,JSON.stringify({condominio_id:manager,codigo_cliente:'567'})])
  await db.exec((await readFile(new URL('../../supabase/migrations/20261022221904_scanner_multiplas_administradoras.sql',import.meta.url),'utf8')).replaceAll('now()',clock))
  const configs=(await db.query('select * from scanner_configuracoes')).rows
  assert.equal(configs.length,2);assert.equal(configs.find(c=>c.condominio_id===outro).ativo,false)
  const cfg=configs.find(c=>c.condominio_id===manager);assert.equal(cfg.portal,'manager');assert.equal(cfg.ativo,true)
  const token=randomUUID();await db.exec('set role service_role')
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[token])).rows.length,1)
  const dados={codigo:'567',unidade:unit,fichas:[{Unidade:unit,Nome:'Pessoa Nova',Email:'nova@example.com'}]}
  await db.query('select scanner_concluir($1,1,$2,false)',[token,JSON.stringify([evidencia(unit,'contatos',dados),evidencia(unit,'pagamentos',{status:'inconclusivo'})])])
  const eid=(await db.query("select id from scanner_evidencias where tipo='contatos'")).rows[0].id
  assert.equal((await db.query('select scanner_aplicar_contato($1,$2) r',[eid,JSON.stringify({nome:'Pessoa Nova',email:'nova@example.com'})])).rows[0].r.resultado,'atualizado')
  assert.equal((await db.query('select responsavel_nome from unidades where id=$1',[unit])).rows[0].responsavel_nome,'Pessoa Nova')
  await db.query("update agente_receitas set config_json=jsonb_set(config_json,'{condominio_id}',to_jsonb($1::text)) where id=$2",[outro,rid])
  await db.exec(`update scanner_controle set proxima_execucao=${clock};update scanner_configuracoes set proxima_execucao=${clock}`)
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
  assert.equal((await db.query("select has_function_privilege('authenticated','scanner_reivindicar(uuid)','execute') allowed")).rows[0].allowed,false)
 }finally{await db.close()}
})
