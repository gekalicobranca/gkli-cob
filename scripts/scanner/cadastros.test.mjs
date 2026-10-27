import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {contatoPrincipal,documentoValido} from './cadastros.mjs'
import {interpretarDocumentoScanner} from './pagamentos.mjs'

test('contato principal não mistura terceiros e não inventa telefone sem DDD',()=>{
 const dados={unidade:'000001',fichas:[{Unidade:'000001',Nome:'Pessoa Nova',Email:'NOVA@example.com',Telefone:'99999-8888'},{Nome:'Cuidados',Celular:'11999998888'}]}
 const p=contatoPrincipal(dados,'000001')
 assert.equal(p.nome,'Pessoa Nova');assert.equal(p.email,'nova@example.com');assert.equal(p.telefone,null)
 assert.throws(()=>contatoPrincipal(dados,'000002'))
 assert.throws(()=>contatoPrincipal({...dados,fichas:[dados.fichas[0],dados.fichas[0]]},'000001'))
 assert.equal(documentoValido('529.982.247-25'),'52998224725');assert.equal(documentoValido('111.111.111-11'),null)
})
test('totais divergentes vão para conferência sem aprovação financeira',()=>{
 const r=interpretarDocumentoScanner([[['Acordo Número','1'],['Unidade','001']],[['Vencimento'],['10/10/2026','Boleto','','Pendente','100,00'],['Valor Total:','200,00'],['Valor Pago:','0,00'],['Valor Em Aberto:','200,00']]],{acordo:'1',unidade:'001'})
 assert.equal(r.ok,false);assert.match(r.motivo,/Totais/);assert.equal(r.resultado,undefined)
})
test('SQL: substitui cadastros com auditoria, preserva vazios e recusa vínculo ambíguo',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table condominios(id uuid primary key,carteira_id uuid,status text,administradora text);
  create table unidades(id uuid primary key default gen_random_uuid(),condominio_id uuid,carteira_id uuid,identificacao text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,email text,updated_at timestamptz default now());
  create table responsaveis_unidades(id uuid primary key default gen_random_uuid(),condominio_id uuid,carteira_id uuid,unidade text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,celular text,telefone_fixo text,telefone_outros text,email text,ativo boolean default true,updated_at timestamptz default now());
  grant all on condominios,unidades,responsaveis_unidades to service_role;
  create function current_user_is_admin() returns boolean language sql as 'select false';`)
  for(const file of ['20261020121015_scanner_enriquecimento_noturno.sql','20261022123307_scanner_cadastros_auditados.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
  const condo=randomUUID(),car=randomUUID(),cfg=randomUUID(),unit=randomUUID(),resp=randomUUID()
  await db.query("insert into condominios values($1,$2,'ativo','Lello')",[condo,car])
  await db.query("insert into scanner_configuracoes(id,condominio_id,codigo_portal,perfil_acesso,unidades,ativo) values($1,$2,'1','PADRAO',array['000001','000002'],true)",[cfg,condo])
  await db.query("insert into unidades(id,condominio_id,carteira_id,identificacao,bloco,responsavel_nome,telefone,email) values($1,$2,$3,'000001','0','Pessoa Antiga','5511999990000','antiga@example.com')",[unit,condo,car])
  await db.query("insert into responsaveis_unidades(id,condominio_id,carteira_id,unidade,bloco,responsavel_nome,telefone,email) values($1,$2,$3,'000001','0','Pessoa Antiga','5511999990000','antiga@example.com')",[resp,condo,car])
  async function prova(unidade='000001',extras={}){
   const dados={codigo:'1',unidade,fichas:[{Unidade:unidade,Nome:'Pessoa Nova',Email:'nova@example.com',Celular:'11999998888',...extras}]},id=randomUUID()
   await db.query("insert into scanner_evidencias(id,configuracao_id,unidade_portal,tipo,dados,sha256) values($1,$2,$3,'contatos',$4,$5)",[id,cfg,unidade,JSON.stringify(dados),randomUUID().replaceAll('-','').repeat(2)])
   return {id,contato:contatoPrincipal(dados,unidade)}
  }
  await db.exec('set role service_role')
  const p=await prova(),aplicar=p=>db.query('select scanner_aplicar_contato($1,$2) as r',[p.id,JSON.stringify(p.contato)])
  assert.equal((await aplicar(p)).rows[0].r.resultado,'atualizado')
  const u=(await db.query('select * from unidades where id=$1',[unit])).rows[0]
  assert.equal(u.responsavel_nome,'Pessoa Nova');assert.equal(u.telefone,'5511999998888');assert.equal(u.email,'nova@example.com')
  assert.equal((await db.query('select responsavel_nome from responsaveis_unidades where id=$1',[resp])).rows[0].responsavel_nome,'Pessoa Nova')
  const audit=(await db.query('select * from scanner_cadastro_auditoria')).rows[0]
  assert.equal(audit.antes.unidade.responsavel_nome,'Pessoa Antiga');assert.equal(audit.depois.unidade.responsavel_nome,'Pessoa Nova')
  await aplicar(p);assert.equal((await db.query('select count(*)::int n from scanner_cadastro_auditoria')).rows[0].n,1)
  const vazio=await prova('000001',{Email:'',Celular:''});await aplicar(vazio)
  assert.equal((await db.query('select telefone,email from unidades where id=$1',[unit])).rows[0].telefone,'5511999998888')
  assert.equal((await db.query('select telefone,email from unidades where id=$1',[unit])).rows[0].email,'nova@example.com')
  await db.query("insert into unidades(condominio_id,carteira_id,identificacao,bloco) values($1,$2,'000002','0'),($1,$2,'000002','0')",[condo,car])
  const ambiguo=await prova('000002');assert.equal((await aplicar(ambiguo)).rows[0].r.resultado,'revisao_vinculo')
  const errado=await prova();errado.contato.nome='Nome Inventado';await assert.rejects(aplicar(errado),/diverge/)
  await db.query("update unidades set responsavel_documento='52998224725' where id=$1",[unit])
  const identidade=await prova('000001',{Nome:'Outra Pessoa'});assert.equal((await aplicar(identidade)).rows[0].r.resultado,'revisao_identidade')
  assert.equal((await db.query('select responsavel_nome from unidades where id=$1',[unit])).rows[0].responsavel_nome,'Pessoa Nova')
  await db.exec('reset role;set role authenticated');await assert.rejects(aplicar(errado),/permission denied/)
 }finally{await db.close()}
})
