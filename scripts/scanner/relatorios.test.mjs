import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {ocorrenciasFinanceiras,montarRelatorio} from './relatorios-modelo.mjs'

test('relatório distingue divergência documentada de ausência de retorno, formata valores e escapa HTML',()=>{
 const fonte={vencimento:'2026-10-01',valor:10000,pago:10000,data:'2026-10-02',recibo:'1234567'}
 const itens=ocorrenciasFinanceiras([{unidade_id:'unidade',evidencia_id:'prova',itens:[
  {id:'a',tipo:'cobranca',resultado:'inconclusivo',motivo:'Sem recebimento explícito'},
  {id:'b',tipo:'cobranca',resultado:'ambiguo',fonte:null},
  {id:'c',tipo:'cobranca',resultado:'divergente',motivo:'Data diverge',app:{vencimento:'2026-10-01',valor:10000,data_pagamento:'2026-10-03'},fonte},
 ]}])
 assert.equal(itens.length,1);assert.match(itens[0].app,/100,00/);assert.match(itens[0].portal,/02\/10\/2026/)
 const r=montarRelatorio({condominio:'<script>teste</script>',portal:'Graiche',consultadoEm:'2026-11-02T17:14:00Z',responsavel:'Camila',itens:[{...itens[0],unidade:'83',categoria:'Revisão',motivo:'Ausência na consulta limitada'}],resumo:{unidades:1,sem_acesso:1}})
 assert.match(r.texto,/14:14/);assert.match(r.texto,/não comprovam divergência nem pagamento/)
 assert.ok(!r.html.includes('<script>teste'));assert.match(r.html,/&lt;script&gt;/)
 assert.match(montarRelatorio({condominio:'Teste',portal:'Lello',consultadoEm:'2026-11-02T17:14:00Z',responsavel:'Camila',itens:[],resumo:{}}).texto,/Nenhuma divergência documentada/)
 const semVinculo={acordo_id:'acordo',resultado:'inconclusivo',motivo:'Acordo sem vínculo externo homologado.'}
 assert.equal(ocorrenciasFinanceiras([{itens:[semVinculo],documentos_disponiveis:false}]).length,0)
 const revisao=ocorrenciasFinanceiras([{itens:[semVinculo],documentos_disponiveis:true}])
 assert.equal(revisao.length,1);assert.match(revisao[0].portal,/não comprova/)
})

test('SQL: relatório selado, carteira de origem/envio, destinatários, judicial, idempotência, transação e RLS',async()=>{
 const db=new PGlite(),op=randomUUID(),outro=randomUUID(),origem=randomUUID(),envio=randomUUID(),condo=randomUUID(),config=randomUUID(),acordo=randomUUID(),judicial=randomUUID(),lote=randomUUID()
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create function current_user_is_admin() returns boolean language sql as 'select false';
   create table profiles(id uuid primary key,nome text,email text);
   create table carteiras(id uuid primary key,operador_id uuid);
   create table condominios(id uuid primary key,carteira_id uuid,operador_id uuid,status text);
   create table scanner_configuracoes(id uuid primary key,condominio_id uuid);
   create table scanner_lotes(token uuid primary key,configuracao_id uuid,concluido_em timestamptz);
   create table acordos(id uuid primary key,condominio_id uuid,carteira_id uuid,operador_id uuid,tipo text);
   create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,operador_id uuid);
   create table integracoes_smtp_config(id uuid,carteira_id uuid,ativo boolean,usuario text,prioridade int);
   create table mensagens(id uuid primary key,carteira_id uuid,contexto text,canal text,destinatario text,email_destinatario text,email_assunto text,conteudo text,conteudo_renderizado text,status text,status_operacional text,aprovado_em timestamptz,payload jsonb,origem_evento text,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,cobranca_id uuid,acordo_id uuid);
   create function email_aviso_interno_autorizado(m mensagens) returns boolean language sql stable security invoker as $$select coalesce(m.payload->>'regra_antiga'='ok',false);$$;
   create function email_smtp_candidatas(p_mensagem uuid) returns table(config_id uuid,conta text,preferencia int) language plpgsql stable security invoker set search_path='' as $$declare m public.mensagens;begin
    select * into strict m from public.mensagens where id=p_mensagem;
    return query select s.id,s.usuario,s.prioridade from public.integracoes_smtp_config s where s.carteira_id=m.carteira_id and s.ativo order by s.prioridade limit 1;
   end$$;
   create function email_reservar_horario(mid uuid,conta text) returns timestamptz language plpgsql as $$begin
    if conta<>'cobranca@gekali.com.br' or public.email_aviso_interno_autorizado((select m from public.mensagens m where id=mid)) is not true then raise exception 'Envio não autorizado';end if;
    update public.mensagens set status='agendada' where id=mid;return now();end$$;
   grant all on all tables in schema public to service_role;grant execute on all functions in schema public to service_role;`)
  await db.query("insert into profiles values($1,'Camila','camila@example.com'),($2,'Outro','outro@example.com')",[op,outro])
  await db.query('insert into carteiras values($1,$3),($2,$3)',[origem,envio,op])
  await db.query("insert into condominios values($1,$2,$3,'ativo')",[condo,origem,op])
  await db.query('insert into scanner_configuracoes values($1,$2)',[config,condo])
  await db.query("insert into acordos values($1,$3,$4,null,'extrajudicial'),($2,$3,$4,null,'judicial')",[acordo,judicial,condo,origem])
  await db.query("insert into integracoes_smtp_config values($1,$2,true,'cobranca@gekali.com.br',100),($3,$2,true,'keila@gekali.com.br',0)",[randomUUID(),envio,randomUUID()])
  await db.query('insert into scanner_lotes values($1,$2,now())',[lote,config])
  await db.exec(await readFile(new URL('../../supabase/migrations/20261102174031_scanner_relatorios_inconsistencias_email.sql',import.meta.url),'utf8'))
  await db.exec('set role service_role')
  const registrar=(chave,operador=op,alvo=acordo)=>db.query('select scanner_registrar_relatorio_email($1,$2,null,$3,$4,$5,$6,$7) id',[chave,config,operador,'Revisão Panamby','Texto aprovado',JSON.stringify([{acordo_id:alvo}]),JSON.stringify({})])
  const id=(await registrar('manual:teste')).rows[0].id
  assert.equal((await registrar('manual:teste')).rows[0].id,id)
  const r=(await db.query('select * from scanner_relatorios_email where id=$1',[id])).rows[0]
  assert.equal((await db.query('select conta from email_smtp_candidatas($1)',[r.mensagem_id])).rows[0].conta,'keila@gekali.com.br')
  await db.exec('reset role')
  await db.exec(await readFile(new URL('../../supabase/migrations/20261102174253_scanner_relatorios_conta_envio.sql',import.meta.url),'utf8'))
  await db.exec('set role service_role')
  assert.equal((await db.query('select conta from email_smtp_candidatas($1)',[r.mensagem_id])).rows[0].conta,'cobranca@gekali.com.br')
  assert.equal(r.carteira_origem_id,origem);assert.equal(r.carteira_envio_id,envio);assert.equal(r.destinatario,'camila@example.com')
  const autorizado=()=>db.query('select email_aviso_interno_autorizado(m) ok from mensagens m where id=$1',[r.mensagem_id])
  assert.equal((await autorizado()).rows[0].ok,true)
  await db.query("update mensagens set destinatario='invasor@example.com' where id=$1",[r.mensagem_id]);assert.equal((await autorizado()).rows[0].ok,false)
  await db.query("update mensagens set destinatario='camila@example.com' where id=$1",[r.mensagem_id])
  await assert.rejects(registrar('manual:judicial',op,judicial),/fora do escopo/)
  await assert.rejects(registrar('manual:outro',outro),/fora do escopo/)
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,1)
  const grupo=operador=>({operador_id:operador,assunto:'Teste lote',texto:'Revisar',itens:[{acordo_id:acordo}],resumo:{}})
  await assert.rejects(db.query('select scanner_registrar_relatorios_lote($1,$2)',[lote,JSON.stringify([grupo(op),grupo(outro)])]),/fora do escopo/)
  assert.equal((await db.query('select count(*)::int n from mensagens')).rows[0].n,1,'Falha no segundo grupo desfaz o primeiro')
  assert.equal((await db.query("select count(*)::int n from scanner_relatorios_lotes_pendentes(now()-interval '1 day')")).rows[0].n,1)
  await db.query('select scanner_registrar_relatorios_lote($1,$2)',[lote,JSON.stringify([grupo(op)])])
  assert.equal((await db.query("select count(*)::int n from scanner_relatorios_lotes_pendentes(now()-interval '1 day')")).rows[0].n,0)
  assert.equal((await db.query("select email_aviso_interno_autorizado(jsonb_populate_record(null::mensagens,'{\"payload\":{\"regra_antiga\":\"ok\"}}'::jsonb)) ok")).rows[0].ok,true,'Regra anterior preservada')
  await db.exec('reset role;set role authenticated')
  assert.equal((await db.query("select has_function_privilege('authenticated','scanner_registrar_relatorio_email(text,uuid,uuid,uuid,text,text,jsonb,jsonb)','execute') ok")).rows[0].ok,false)
  assert.equal((await db.query('select count(*)::int n from scanner_relatorios_email')).rows[0].n,0)
  await db.query("select set_config('test.uid',$1,false)",[op])
  assert.equal((await db.query('select count(*)::int n from scanner_relatorios_email')).rows[0].n,2)
  await assert.rejects(db.query('update scanner_relatorios_email set texto=$1 where id=$2',['alterado',id]),/permission denied/)

  // Revisão judicial exige opt-in, evidência nova e escopo exato; nenhuma rotina
  // financeira é chamada pela migração ou pelo registro deste relatório.
  await db.exec(`reset role;
   alter table scanner_configuracoes add portal text default 'graiche',add ativo boolean default true,add codigo_portal text default '0';
   alter table acordos add unidade_id uuid,add status text default 'ativo';
   alter table scanner_lotes add iniciado_em timestamptz default now()-interval '1 minute';
   create table scanner_evidencias(id uuid primary key,configuracao_id uuid,unidade_portal text,tipo text,observado_em timestamptz,dados jsonb);
   grant select,insert,update on scanner_evidencias to service_role;`)
  const unidade=randomUUID(),evidencia=randomUUID()
  await db.query('update acordos set unidade_id=$1',[unidade])
  const prova={codigo:'0',unidade,status:'inconclusivo',conferencia_acordos:{versao:1,situacao:'unidade_nao_disponivel',fonte:'https://servc9-1.webware.com.br/bin/rt/gAcordo.asp'}}
  await db.query("insert into scanner_evidencias values($1,$2,$3,'pagamentos',now(),$4)",[evidencia,config,unidade,JSON.stringify(prova)])
  await db.exec(await readFile(new URL('../../supabase/migrations/20261103033946_scanner_graiche_revisao_judicial.sql',import.meta.url),'utf8'))
  await db.exec('set role service_role')
  const item={acordo_id:judicial,evidencia_id:evidencia,tipo_revisao:'judicial',baixa_permitida:false,revisao_humana_obrigatoria:true}
  const registrarJudicial=(chave,j=item,token=null)=>db.query('select scanner_registrar_relatorio_email($1,$2,$3,$4,$5,$6,$7,$8) id',[chave,config,token,op,'Revisão judicial','Revisão obrigatória; nenhuma baixa.',JSON.stringify([j]),'{}'])
  await assert.rejects(registrarJudicial('jud:sem-optin'),/fora do escopo/)
  await db.query('update scanner_configuracoes set relatorio_judicial=true where id=$1',[config])
  await assert.rejects(registrarJudicial('jud:sem-prova',{...item,evidencia_id:randomUUID()}),/fora do escopo/)
  await assert.rejects(registrarJudicial('jud:sem-revisao',{...item,revisao_humana_obrigatoria:false}),/fora do escopo/)
  await assert.rejects(registrarJudicial('jud:com-baixa',{...item,baixa_permitida:true}),/fora do escopo/)
  await db.query("update scanner_evidencias set observado_em=now()-interval '2 days'")
  await assert.rejects(registrarJudicial('jud:antigo'),/fora do escopo/)
  await db.query("update scanner_evidencias set observado_em=now(),dados=jsonb_set(dados,'{conferencia_acordos,fonte}','\"https://outro.example\"')")
  await assert.rejects(registrarJudicial('jud:outra-fonte'),/fora do escopo/)
  await db.query('update scanner_evidencias set dados=$1,unidade_portal=$2',[JSON.stringify(prova),randomUUID()])
  await assert.rejects(registrarJudicial('jud:outra-unidade'),/fora do escopo/)
  await db.query('update scanner_evidencias set unidade_portal=$1',[unidade])
  const idJudicial=(await registrarJudicial('jud:autorizado')).rows[0].id
  assert.equal((await registrarJudicial('jud:autorizado')).rows[0].id,idJudicial)
  await db.query("update scanner_lotes set iniciado_em=now()-interval '2 days',concluido_em=now()-interval '1 day'")
  await assert.rejects(registrarJudicial('jud:fora-lote',item,lote),/fora do escopo/)
  await db.exec('reset role;set role authenticated')
  assert.equal((await db.query("select has_function_privilege('authenticated','scanner_relatorio_judicial_permitido(uuid,uuid,uuid,uuid)','execute') pode")).rows[0].pode,false)
 }finally{await db.close()}
})
