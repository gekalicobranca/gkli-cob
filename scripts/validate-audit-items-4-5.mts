import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { LIDIA_PILOTOS, condominioCarteiraLidia } = require('../features/agentes-virtuais/perfis.ts')
const { CADIZ_ID, CADIZ_CARTEIRA } = require('../features/lidia/conferencia-manager.ts')
const db = new PGlite()
const read = (file: string) => readFileSync(file, 'utf8')
const migration = (name: string) => read('supabase/migrations/' + name)
const uid = '00000000-0000-0000-0000-000000000099'
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','${uid}')::uuid $$;
create function public.current_user_can_access_carteira(uuid) returns boolean language sql as $$select coalesce(current_setting('test.access',true),'yes')<>'no'$$;
create table profiles(id uuid primary key,role text); insert into profiles values('${uid}','admin');
create table carteiras(id uuid primary key,nome text);
create table condominios(id uuid primary key,carteira_id uuid,nome text,operacao_virtual_habilitada boolean default true,parcelas_acordo_sem_aprovacao_sindico int default 0,despesas_acordo_avista_percentual numeric,despesas_acordo_parcelado_percentual numeric,dias_apos_vencimento_regua int,inicio_cobranca_dias int,bloqueio_garantidora_habilitado boolean default false,bloqueio_garantidora_inicio date,bloqueio_garantidora_fim date,updated_at timestamptz);
create table unidades(id uuid primary key,carteira_id uuid,condominio_id uuid,identificacao text,acao_judicial boolean);
create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,vencimento date,valor_original numeric,valor_atualizado numeric,status text,status_operacional text,status_financeiro text,observacoes text,duplicada_de_id uuid);
create table central_pendencias(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,acordo_id uuid,tipo text,origem text,status text,titulo text,payload jsonb,updated_at timestamptz,resolvido_em timestamptz);
create table acordos(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,condominio_id uuid,unidade_id uuid,tipo text,numero_processo text,valor_acordado numeric,entrada numeric,despesa_cobranca_percentual numeric,despesa_cobranca_valor numeric,data_acordo date,status text,fluxo_status text,exige_aprovacao_sindico boolean,documento_url text,observacoes text,devedor_aceito_em timestamptz,sindico_aprovado_em timestamptz,boletos_solicitados_em timestamptz,
constraint acordos_fluxo_status_chk check (fluxo_status in ('rascunho','aceito_aguardando_boletos','boletos_solicitados','boletos_recebidos','boletos_enviados','acordo_efetivado')));
create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid,valor_original_no_acordo numeric,valor_atualizado_no_acordo numeric,encargos_no_acordo numeric,valor_total_no_acordo numeric);
create table parcelas_acordo(id uuid default gen_random_uuid(),acordo_id uuid,numero int,tipo_parcela text,valor numeric,vencimento date,status text,data_pagamento date);
create table acordos_termos(id uuid primary key default gen_random_uuid(),acordo_id uuid,carteira_id uuid,status text,tipo_aceite text,visualizado_em timestamptz,aceito_em timestamptz);
create table mensagens(id uuid primary key default gen_random_uuid(),acordo_id uuid,carteira_id uuid,contexto text,canal text,status text,status_operacional text,destinatario text,email_assunto text,conteudo_renderizado text,aprovado_em timestamptz,payload jsonb default '{}',cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,origem_evento text,provider_message_id text,provider_status text);
create table email_tentativas(mensagem_id uuid,estado text);
create table thunderbird_envios(mensagem_id uuid,estado text);
create table whatsapp_web_envios(mensagem_id uuid,estado text);
`)
for (const p of LIDIA_PILOTOS) {
 await db.query('insert into carteiras values($1,$2)', [p.carteira_id, p.id === CADIZ_ID ? 'Escritório Genske Adv' : 'Genske Advogados'])
 await db.query('insert into condominios(id,carteira_id,nome) values($1,$2,$3)', [p.id,p.carteira_id,p.id === CADIZ_ID ? 'Cádiz' : 'CONDOMÍNIO EDIFÍCIO OASIS'])
}
await db.exec(read('scripts/fixtures/acordos/criar-acordo-financeiro-antes-bloqueio.sql'))
await db.exec(migration('20261007195910_agentes_virtuais_negociacao_compartilhada.sql'))
await db.exec(migration('20261011145723_lidia_piloto_oasis.sql'))
// Reproduce the old Cádiz migration, before its wallet was moved.
await db.query('update condominios set carteira_id=$1 where id=$2',[LIDIA_PILOTOS[0].carteira_id,CADIZ_ID])
await db.exec(migration('20261018033303_lidia_incluir_cadiz_conferencia.sql'))
await db.query('update condominios set carteira_id=$1 where id=$2',[CADIZ_CARTEIRA,CADIZ_ID])
function extract(sql: string, name: string) {
 const start = sql.indexOf('create function public.' + name)
 const end = sql.indexOf('$$;', start) + 3
 assert.ok(start >= 0 && end > start)
 return sql.slice(start,end)
}
const notices = migration('20261021123819_lidia_aviso_pedido_boletos_humano.sql')
await db.exec(extract(notices,'lidia_aviso_boletos_autorizado'))
await db.exec(extract(notices,'lidia_preparar_aviso_boletos'))
// These fixtures exercise the exact old predicate anchors, without sending notifications.
await db.exec(`
create function agente_virtual_formalizacao_humana() returns trigger language plpgsql as $$begin if new.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid and new.tipo='lidia_atendimento' then return new; end if; return new; end$$;
create function agente_virtual_avisar_operador() returns trigger language plpgsql as $$begin if new.tipo='lidia_atendimento' and new.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid then return new; end if; return new; end$$;
create function email_aviso_interno_autorizado(m public.mensagens) returns boolean language sql as $$select exists(select 1 from central_pendencias c where c.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid)$$;
`)
await db.exec(migration('20261102171113_audit_lidia_formalizacao_eventos.sql'))
for (const cond of [...LIDIA_PILOTOS.map(p=>p.id),null,uid]) for (const wallet of [...LIDIA_PILOTOS.map(p=>p.carteira_id),null,uid]) {
 const value=(await db.query<{ok:boolean}>('select lidia_escopo_autorizado($1,$2) ok',[cond,wallet])).rows[0].ok
 assert.equal(value,condominioCarteiraLidia({id:cond!,carteira_id:wallet!}))
}
// Real proposal, acceptance and payment/efetivação for both current pairs; rollback.
await db.exec(read('scripts/fixtures/lidia/negociacao-pares-atuais.sql'))
await db.exec(`create trigger test_preparar_aviso before insert or update of payload on central_pendencias for each row when(new.tipo='lidia_atendimento') execute function lidia_preparar_aviso_boletos();`)
for (const pilot of LIDIA_PILOTOS) {
 const notice=(await db.query<{id:string,payload:any}>(`insert into central_pendencias(id,tipo,carteira_id,condominio_id,status,titulo,payload)
 values(gen_random_uuid(),'lidia_atendimento',$1,$2,'em_tratamento','Pedido boletos',$3) returning id,payload`,[pilot.carteira_id,pilot.id,JSON.stringify({estado:'atendimento_humano',emails:[{chave:'mensagem-real',resumo:'Preciso do boleto',recebido_em:'2026-11-02'}],encaminhamento_humano:{motivo:'pedido_boletos'}})])).rows[0]
 const aviso=notice.payload.avisos_boletos[0]
 assert.ok(aviso?.mensagem_id)
 const result=await db.query<{ok:boolean}>(`select lidia_aviso_boletos_autorizado(row($1::uuid,null::uuid,$2::uuid,'mensageria','email','aprovada','aprovada','acordos.camila@genskeadvogados.com.br',$3::text,$4::text,now(),$5::jsonb,null::uuid,null::uuid,null::uuid,null::text,null::text,null::text)::mensagens) ok`,[aviso.mensagem_id,pilot.carteira_id,aviso.assunto,aviso.texto,JSON.stringify({keila_caso_id:notice.id,email_cc:['edi.neves@gekali.com.br'],aviso_formalizacao:{regra:'operador_lidia_boletos_v1'}})])
 assert.equal(result.rows[0].ok,true)
}
await db.exec('drop trigger test_preparar_aviso on central_pendencias')
console.log('PASS item 4: pares TypeScript/SQL, nulos, carteiras trocadas; proposta/aceite/baixa para Oásis e Cádiz.')

await db.exec(migration('20261102171126_audit_formalizacao_evidencias.sql'))
const p=LIDIA_PILOTOS[0]
const a=(await db.query<{id:string}>("insert into acordos(carteira_id,status,fluxo_status) values($1,'ativo','rascunho') returning id",[p.carteira_id])).rows[0].id
const term=(await db.query<{id:string}>("insert into acordos_termos(acordo_id,carteira_id,status) values($1,$2,'pendente') returning id",[a,p.carteira_id])).rows[0].id
const msg=(await db.query<{id:string}>("insert into mensagens(acordo_id,carteira_id,status,payload) values($1,$2,'rascunho',$3) returning id",[a,p.carteira_id,JSON.stringify({termo_id:term})])).rows[0].id
const events=async()=> (await db.query<{evento:string}>('select evento from acordo_formalizacao_eventos where acordo_id=$1',[a])).rows.map(x=>x.evento)
assert.ok((await events()).includes('termo_gerado'))
assert.ok(!(await events()).includes('termo_enviado'))
assert.ok(!(await events()).includes('termo_aceito'))
await assert.rejects(db.query("update mensagens set status='enviada' where id=$1",[msg]),/sem confirmação/)
await db.query("update mensagens set status='aprovada' where id=$1",[msg])
assert.ok((await events()).includes('termo_liberado'))
await db.query("insert into email_tentativas values($1,'enviado')",[msg])
await db.query("update mensagens set status='enviada' where id=$1",[msg])
assert.ok((await events()).includes('termo_enviado'))
assert.ok(!(await events()).includes('termo_entregue'))
await assert.rejects(db.query("update mensagens set provider_status='delivered',provider_message_id='recibo-1' where id=$1",[msg]),/Entrega exige/)
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:'service_role'})])
await db.query("update mensagens set provider_status='delivered',provider_message_id='recibo-1' where id=$1",[msg])
assert.ok((await events()).includes('termo_entregue'))
await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,role:'authenticated'})])
await assert.rejects(db.query('select acordo_confirmar_envio_termo($1,$2,$3,$4)',[a,term,'email','']),/evidência/)
await db.query('select acordo_confirmar_envio_termo($1,$2,$3,$4)',[a,term,'email','Message-ID externo confirmado #777'])
assert.equal((await db.query<{status:string}>('select status from acordos_termos where id=$1',[term])).rows[0].status,'pendente')
await assert.rejects(db.query('select acordo_confirmar_envio_termo($1,$2,$3,$4)',[a,term,'email','Message-ID externo confirmado #777']),/já confirmado/)
await db.query("update acordos_termos set status='visualizado',visualizado_em=now() where id=$1",[term])
assert.ok((await events()).includes('termo_visualizado'))
const request=(await db.query<{id:string}>("insert into mensagens(acordo_id,carteira_id,status,origem_evento) values($1,$2,'rascunho','acordo_boletos_administradora') returning id",[a,p.carteira_id])).rows[0].id
assert.equal((await db.query<{fluxo_status:string,boletos_solicitados_em:unknown}>('select fluxo_status,boletos_solicitados_em from acordos where id=$1',[a])).rows[0].boletos_solicitados_em,null)
const confirm=(evt:string,evidence='Protocolo confirmado #1234')=>db.query('select acordo_confirmar_etapa_boletos($1,$2,$3)',[a,evt,evidence])
await assert.rejects(confirm('boletos_recebidos'),/anterior sem evidência/)
await assert.rejects(confirm('boletos_enviados'),/anterior sem evidência/)
await assert.rejects(confirm('solicitacao_enviada',''),/evidência/)
await assert.rejects(db.query("update acordos set fluxo_status='boletos_recebidos' where id=$1",[a]),/sem evidência/)
await db.query("insert into email_tentativas values($1,'enviado')",[request])
await db.query("update mensagens set status='enviada' where id=$1",[request])
assert.ok((await events()).includes('solicitacao_enviada'))
await assert.rejects(confirm('solicitacao_enviada'),/já confirmada/)
await db.exec("set test.access='no'")
await assert.rejects(confirm('boletos_recebidos'),/Sem permissão/)
await db.exec("set test.access='yes'")
await db.query("update profiles set role='cliente' where id=$1",[uid])
await assert.rejects(confirm('boletos_recebidos'),/Sem permissão/)
await db.query("update profiles set role='admin' where id=$1",[uid])
await db.query("insert into central_pendencias(id,acordo_id,carteira_id,tipo,status) values(gen_random_uuid(),$1,$2,'emissao_boletos_acordo','aberta')",[a,p.carteira_id])
await db.exec(`create function test_falha_pendencia() returns trigger language plpgsql as $$begin raise exception 'Falha simulada na pendência';end$$; create trigger test_falha before update on central_pendencias for each row execute function test_falha_pendencia();`)
await assert.rejects(confirm('boletos_recebidos'),/Falha simulada/)
assert.ok(!(await events()).includes('boletos_recebidos'))
assert.equal((await db.query<{fluxo_status:string}>('select fluxo_status from acordos where id=$1',[a])).rows[0].fluxo_status,'boletos_solicitados')
await db.exec('drop trigger test_falha on central_pendencias')
await confirm('boletos_recebidos')
await assert.rejects(confirm('boletos_recebidos'),/já confirmada/)
await confirm('boletos_enviados')
await assert.rejects(confirm('boletos_enviados'),/já confirmada/)
await assert.rejects(db.query("update acordos set fluxo_status='boletos_solicitados' where id=$1",[a]),/retroceder/)
assert.equal((await events()).filter(x=>x==='boletos_recebidos').length,1)
assert.equal((await db.query<{n:number}>('select count(*)::int n from acordo_formalizacao_eventos where acordo_id=$1 and usuario_id is null',[a])).rows[0].n,0)
assert.equal((await db.query<{ok:boolean}>("select has_table_privilege('authenticated','acordo_formalizacao_eventos','insert') ok")).rows[0].ok,false)
assert.equal((await db.query<{ok:boolean}>("select has_table_privilege('authenticated','acordo_formalizacao_eventos','update') ok")).rows[0].ok,false)
assert.equal((await db.query<{ok:boolean}>("select has_table_privilege('authenticated','acordo_formalizacao_eventos','delete') ok")).rows[0].ok,false)
console.log('PASS item 5: rascunho/liberação/envio real, termo sem aceite presumido, ordem/evidências, permissões, histórico e repetição.')
await db.close()
