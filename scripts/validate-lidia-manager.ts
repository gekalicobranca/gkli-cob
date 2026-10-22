import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as XLSX from 'xlsx'
import {lerConferenciaManager,selecionarCotasManager} from '../features/lidia/conferencia-manager'
import {conferirProposta,renderizarPropostaConferida} from '../features/keila/conferencia-proposta'
import {gerarConferenciaProposta,validarConferenciaAtual,prepararPropostaConferida} from '../features/keila/conferencia-proposta-service'
import {CADIZ_ID,CADIZ_CARTEIRA} from '../features/lidia/conferencia-manager'
import {createHash} from 'node:crypto'
const name='CONDOMÍNIO CÁDIZ JARDIM PRUDÊNCIA'
const header=['Recibo','Vencimento','Emissão','Conta','Histórico','Moeda','Valor Original','Valor Principal','Multa','Correção','Juros','Total']
const row=(id:string,date:string,total='102,00',principal='100,00',multa='2,00',history='TX CONDOMINIO')=>[id,date,'','2',history,'R$',principal,principal,multa,'0,00','0,00',total]
const subtotal=(label:string,total='102,00',principal='100,00',multa='2,00')=>[label,'','','','','R$',principal,principal,multa,'0,00','0,00',total]
function fixture(change?:(s:unknown[][][])=>void,html=false){
 const sheets:unknown[][][]=[[[`Período de 01/01/1900 00:00:00 a 22/10/2026 09:00:00`],[`Condomínio: 656 - ${name}`]],[['Bloco: 0 Unidade: 000407 MÁRCIO TESTE']],[header,row('123','05/08/2026'),subtotal('Total do Recibo:'),row('124','05/10/2026'),subtotal('Total do Recibo:'),subtotal('Total Geral da Unidade:','204,00','200,00','4,00')],[['Bloco: 1 Unidade: 000407 OUTRA PESSOA']],[header,row('125','05/07/2026'),subtotal('Total do Recibo:'),subtotal('Total Geral da Unidade:')],[['Quantidade de unidade(s) em aberto: 2','','','','Total do condomínio :','R$','300,00','300,00','6,00','0,00','0,00','306,00']]]
 change?.(sheets)
 if(html)return Buffer.from(sheets.map(s=>`<table>${s.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table>`).join(''),'latin1')
 const w=XLSX.utils.book_new();sheets.forEach((s,i)=>XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(s),`S${i+1}`));return XLSX.write(w,{type:'buffer',bookType:'xlsx'}) as Buffer
}
const unit={identificacao:'000407',bloco:'0',responsavel_nome:'MARCIO TESTE'}
test('Manager HTML/XLS e XLSX preservam centavos, datas brasileiras, acentos e todas as tabelas',()=>{
 for(const html of [false,true]){
  const r=lerConferenciaManager(fixture(undefined,html))
  assert.equal(r.unidades,2);assert.equal(r.recibos.length,3);assert.equal(r.total,306)
  const cotas=selecionarCotasManager(r,unit,name,'2026-10-22')
  assert.deepEqual(cotas.map(c=>c.vencimento),['2026-08-05','2026-10-05'])
  assert.equal(cotas[0].valor,102);assert.equal(cotas[0].componentes[0].valor_principal,100)
  assert.ok(cotas[0].planilha);assert.equal(cotas[0].recibo,'123')
 }
})
test('serviço revalida fonte/cadastro antes da aprovação e só persiste rascunho',async()=>{
 const buffer=fixture(),exec='exec',arquivo='arq',writes:string[]=[],rule={nome:name,administradora:'Manager',dias_apos_vencimento_regua:45,despesas_acordo_avista_percentual:10,despesas_acordo_parcelado_percentual:20,parcelas_acordo_sem_aprovacao_sindico:3}
 const c:any={id:'caso',tipo:'lidia_atendimento',condominio_id:CADIZ_ID,carteira_id:CADIZ_CARTEIRA,updated_at:'version',payload:{versao:1,estado:'em_analise',intencao:'parcelamento',unidade_ids:['unit'],execucao_id:exec,emails:[{chave:'retorno-real',nome:'Márcio',remetente:'teste@example.com',assunto:'Cádiz',recebido_em:'2026-10-22T12:00:00Z'}],atividades:[],modo:'supervisionado',envio_permitido:false}}
 const tables:any={agente_execucoes:{id:exec,status:'sucesso',created_at:'2026-10-22T12:00:00Z'},agente_arquivos:{id:arquivo,nome_arquivo:'manager.xls',storage_path:'exec/manager.xls',hash_arquivo:createHash('sha256').update(buffer).digest('hex')},unidades:{id:'unit',...unit,email:'teste@example.com',acao_judicial:false},condominios:rule,acordos:[],cobrancas:[{id:'aug',vencimento:'2026-08-05',valor_atualizado:102,status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'},{id:'oct',vencimento:'2026-10-05',valor_atualizado:102,status_operacional:'novo',status_financeiro:'em_aberto'}]}
 const db:any={storage:{from(){return {async download(){return {data:new Blob([new Uint8Array(buffer)]),error:null}}}}},from(table:string){
  let mutation:any=null
  const result=()=>({data:mutation?{id:table==='central_pendencias'?c.id:'evento'}:tables[table],error:null})
  const q:any={select(){return q},eq(){return q},in(){return q},limit(){return q},single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},update(v:any){assert.equal(table,'central_pendencias');writes.push(table);mutation=v;c.payload=v.payload;return q},insert(v:any){assert.equal(table,'timeline_operacional');writes.push(table);mutation=v;return q},then(resolve:any){return Promise.resolve(result()).then(resolve)}};return q}}
 const input={arquivo_id:arquivo,quantidade:3,vencimento:'2026-10-29'}
 const p=await gerarConferenciaProposta(db,c,input,new Date('2026-10-22T12:00:00Z'))
 assert.equal(p.fonte_formato,'manager_cadiz_v1');assert.equal(p.plano.parcelado.total,122.4);assert.equal(writes.length,0)
 c.payload.conferencia_proposta=p;c.payload.resposta_simulada=p.texto
 assert.equal((await validarConferenciaAtual(db,c)).hash,p.hash)
 c.payload.resposta_simulada+=' alterado';await assert.rejects(validarConferenciaAtual(db,c),/mudaram/);c.payload.resposta_simulada=p.texto
 tables.agente_arquivos.hash_arquivo='0'.repeat(64);await assert.rejects(gerarConferenciaProposta(db,c,input),/Hash/);tables.agente_arquivos.hash_arquivo=p.sha256
 tables.acordos=[{id:'ativo'}];await assert.rejects(gerarConferenciaProposta(db,c,input),/acordo existente/);tables.acordos=[]
 await assert.rejects(gerarConferenciaProposta(db,{...c,carteira_id:'carteira-antiga'},input),/somente/)
 tables.condominios={...rule,despesas_acordo_avista_percentual:null};await assert.rejects(gerarConferenciaProposta(db,c,input),/Regras/);tables.condominios=rule
 c.payload.conferencia_proposta=undefined;c.payload.resposta_simulada=null
 await prepararPropostaConferida(db,c,input,null)
 assert.deepEqual(writes,['central_pendencias','timeline_operacional'])
 assert.equal(c.payload.estado,'proposta_preparada');assert.ok(c.payload.resposta_simulada.includes('Lidia | Genske Advogados'));assert.equal(c.payload.resposta_aprovada,undefined)
 assert.equal(c.payload.envio_permitido,false)
 await assert.rejects(prepararPropostaConferida(db,{...c,payload:{...c.payload,estado:'atendimento_humano'}},input,null),/humano/)
})
test('não usa outro bloco, outro responsável, outro condomínio ou posição antiga',()=>{
 const r=lerConferenciaManager(fixture())
 assert.throws(()=>selecionarCotasManager(r,{...unit,bloco:'3'},name,'2026-10-22'),/Unidade\/bloco/)
 assert.throws(()=>selecionarCotasManager(r,{...unit,responsavel_nome:'OUTRA PESSOA'},name,'2026-10-22'),/Responsável/)
 assert.throws(()=>selecionarCotasManager(r,unit,'OUTRO CONDOMINIO','2026-10-22'),/Condomínio/)
 assert.throws(()=>selecionarCotasManager(r,unit,name,'2026-10-23'),/mesmo dia/)
})
test('recusa fonte parcial, subtotal, total geral e quantidade divergentes',()=>{
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[2].splice(5,1))),/ausente|Fechamento/)
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[2][2][11]='103,00')),/divergentes/)
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[5][0][11]='307,00')),/divergentes/)
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[5][0][0]='Quantidade de unidade(s) em aberto: 3')),/Quantidade/)
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[5]=[])),/incompleto/)
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[2][1][7]='')),/ausente ou inválido/)
})
test('marcador judicial, multa por infração e recibo duplicado bloqueiam proposta',()=>{
 for(const change of [(s:unknown[][][])=>{s[2][1][0]='J 123'},(s:unknown[][][])=>{s[2][1][4]='MULTA POR INFRAÇÃO'}]){
  assert.throws(()=>selecionarCotasManager(lerConferenciaManager(fixture(change)),unit,name,'2026-10-22'),/restrição/)
 }
 assert.throws(()=>lerConferenciaManager(fixture(s=>s[2][3][0]='123')),/duplicado/)
 assert.throws(()=>selecionarCotasManager(lerConferenciaManager(fixture(s=>s[2][3][1]='05/08/2026')),unit,name,'2026-10-22'),/mesmo vencimento/)
})
test('concilia régua de 45 dias, 10%/20%, três parcelas e validade de sete dias sem alterar cadastro',()=>{
 const cotas=selecionarCotasManager(lerConferenciaManager(fixture()),unit,name,'2026-10-22')
 const cadastro=cotas.map((c,i)=>({id:String(i),vencimento:c.vencimento,valor_atualizado:c.valor,status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'}))
 const copy=JSON.stringify(cadastro),regras={dias_apos_vencimento_regua:45,despesas_acordo_avista_percentual:10,despesas_acordo_parcelado_percentual:20,parcelas_acordo_sem_aprovacao_sindico:3}
 const p=conferirProposta(cotas,cadastro,regras,3,'2026-10-29',new Date('2026-10-22T12:00:00Z'),{suspenderAntesDe:null})
 assert.equal(p.incluidas.length,1);assert.equal(p.excluidas[0].motivo,'Fora da régua de 45 dias')
 assert.equal(p.avista.total,112.2);assert.equal(p.parcelado.total,122.4)
 assert.deepEqual(p.parcelado.parcelas.map(x=>x.valor),[40.8,40.8,40.8])
 const text=renderizarPropostaConferida('Teste','unidade 407',name,'2026-10-22',p,undefined,{agenteId:'lidia'})
 assert.match(text,/Lidia \| Genske Advogados/);assert.match(text,/validade de 7 dias/)
 assert.equal(JSON.stringify(cadastro),copy)
 assert.throws(()=>conferirProposta(cotas,cadastro,regras,4,'2026-10-29',new Date('2026-10-22T12:00:00Z'),{suspenderAntesDe:null}),/aprovação/)
 assert.throws(()=>conferirProposta(cotas.slice(1),cadastro,regras,3,'2026-10-29',new Date('2026-10-22T12:00:00Z'),{suspenderAntesDe:null}),/ausente|elegíveis/)
 const old=[{vencimento:'2025-08-05',valor:102,linha:9}]
 const oldCadastro=[{...cadastro[0],vencimento:'2025-08-05'}]
 assert.equal(conferirProposta(old,oldCadastro,regras,3,'2026-10-29',new Date('2026-10-22T12:00:00Z'),{suspenderAntesDe:null}).incluidas.length,1,'Cádiz não herda suspensão exclusiva do Safira')
})
