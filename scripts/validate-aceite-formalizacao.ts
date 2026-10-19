import { formalizacoesPendentes } from '../features/keila/formalizacao-administradora'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { atencaoEtapas } from '../features/keila/atencao-etapas'
import type { KeilaCasoPayload } from '../features/keila/casos'

async function main() {
 const db=new PGlite()
 try {
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth; create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000009'::uuid$$;
   create table central_pendencias(id uuid primary key,tipo text,carteira_id uuid,condominio_id uuid,status text,descricao text,payload jsonb,updated_at timestamptz);
   create table condominios(id uuid,carteira_id uuid,nome text);
   create table mensagens(id uuid primary key,carteira_id uuid,contexto text,canal text,status text,status_operacional text,destinatario text,email_assunto text,conteudo text,conteudo_renderizado text,aprovado_em timestamptz,payload jsonb,agendada_para timestamptz,erro_envio text);
   create table teste_agenda(falhar boolean); insert into teste_agenda values(false);
   create function email_reservar_horario(p_mensagem uuid,p_remetente text) returns timestamptz language plpgsql as $$begin if (select falhar from public.teste_agenda) then raise exception 'Agenda indisponível'; end if; update public.mensagens set status='agendada',agendada_para=now() where id=p_mensagem; return now(); end$$;
   create table acordos(id uuid primary key,unidade_id uuid,carteira_id uuid,condominio_id uuid,devedor_aceito_em timestamptz,status text);
   create function agente_virtual_negociar_acordo(p_agente text,p_caso uuid,p_unidade uuid,p_operacao text,p_dados jsonb,p_evidencia text) returns jsonb language plpgsql as $$
   declare caso central_pendencias; proposta jsonb; acordo uuid; etapa text;
   begin
    select * into caso from central_pendencias where id=p_caso and tipo=p_agente||'_atendimento' for update;
    if p_agente='lidia' and false then raise exception 'Piloto'; end if;
    if caso.payload->>'estado'='atendimento_humano' then raise exception 'Atuação humana'; end if;
    select value into proposta from jsonb_array_elements(caso.payload->'acordos') where value->>'unidade_id'=p_unidade::text;
    acordo:=gen_random_uuid(); etapa:='acordo_firmado';
    insert into acordos values(acordo,p_unidade,caso.carteira_id,caso.condominio_id,now(),'ativo');
    if p_evidencia='falhar' then update acordos set carteira_id=null where id=acordo; end if;
    proposta:=proposta||jsonb_build_object('id',acordo,'etapa',etapa,'assunto','Acordo');
    update central_pendencias set payload=caso.payload||jsonb_build_object('acordos',jsonb_build_array(proposta),'estado','proposta_preparada'),updated_at=now() where id=caso.id;
    return proposta;
   end $$;
  `)
  await db.exec(readFileSync('supabase/migrations/20261019004657_aceite_agentes_encaminhar_humano.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20261019005823_avisar_operador_acordo_firmado.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20261019010614_aviso_operador_lidia_camila.sql','utf8'))
  const id='00000000-0000-0000-0000-000000000001',unidade='00000000-0000-0000-0000-000000000002'
  const proposta={id:'proposta-original',unidade_id:unidade,unidade:'35',etapa:'possivel_acordo',base:100,despesas:10,total:110,percentual:10,parcelas:[{numero:1,valor:110,vencimento:'2026-11-05'}]}
  const original={versao:1,estado:'proposta_preparada',acordos:[proposta],resposta_aprovada:{texto:'texto aprovado',mensagem_id:'mensagem-original'},atividades:[],acompanhamento:{conversas:[{message_id:'original'}],pendencias:[{id:'anterior',tipo:'proposta',prazo:'2026-10-20',proxima_acao:'Preservar'}]}}
  const cenarios: [string,boolean,string?][]=[['keila',false],['lidia',false],['keila',true],['keila',false,'06827218-e2b1-4267-ad8f-81a0ab222cad'],['lidia',false,'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3']]
  for(const [agente,falhaAgenda,carteiraAlternativa] of cenarios) {
   await db.query('update teste_agenda set falhar=$1',[falhaAgenda])
   const carteira=carteiraAlternativa??(agente==='keila'?'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3':'06827218-e2b1-4267-ad8f-81a0ab222cad')
   const deveAvisar=!carteiraAlternativa
   await db.query("insert into condominios values('00000000-0000-0000-0000-000000000004',$1,'Condomínio de teste')",[carteira])
   await db.query("insert into central_pendencias values($1,$2,$4,'00000000-0000-0000-0000-000000000004','em_tratamento','',$3::jsonb,'2026-10-18T12:00:00Z')",[id,`${agente}_atendimento`,JSON.stringify(original),carteira])
   const aceitar=(evidencia='Aceito os valores e vencimentos',versao='2026-10-18T12:00:00Z')=>db.query('select agente_virtual_negociar_acordo($1,$2,$3,$4,$5::jsonb,$6)',[agente,id,unidade,'aceitar',JSON.stringify({updated_at:versao}),evidencia])
   await assert.rejects(aceitar('aceito','2026-10-17T12:00:00Z'),/alterado/)
   await assert.rejects(aceitar('falhar'),/vínculo financeiro/)
   assert.equal((await db.query<{n:number}>('select count(*)::int n from acordos')).rows[0].n,0,'Falha no encaminhamento reverte também a criação financeira')
   await aceitar()
   const registro=(await db.query<{payload:KeilaCasoPayload}>('select payload from central_pendencias where id=$1',[id])).rows[0].payload
   assert.equal(registro.estado,'atendimento_humano')
   const acordo=registro.acordos![0]
   assert.equal(acordo.etapa,'acordo_firmado'); assert.equal(acordo.total,110)
   assert.deepEqual(acordo.formalizacao?.proposta_aceita,proposta)
   assert.equal(acordo.formalizacao?.evidencia,'Aceito os valores e vencimentos')
   assert.deepEqual(registro.resposta_aprovada,original.resposta_aprovada,'Texto e aprovação preservados')
   assert.equal(registro.acompanhamento!.pendencias.length,2)
   assert.equal(registro.acompanhamento!.pendencias[1].acordo_id,acordo.id)
   assert.match(registro.acompanhamento!.pendencias[1].proxima_acao,/termo e boletos/)
   assert.deepEqual(registro.acompanhamento!.conversas,original.acompanhamento.conversas)
   assert.equal((await db.query<{n:number}>("select count(*)::int n from acordos where status='ativo' and devedor_aceito_em is not null")).rows[0].n,1,'Acordo permanece criado no app')
   const avisos=(await db.query<{destinatario:string;payload:{email_cc:string[]};conteudo:string;status:string}>('select * from mensagens')).rows
   assert.equal(avisos.length,deveAvisar?1:0,'Destinatários restritos ao agente e à carteira autorizados')
   if(deveAvisar) {
    assert.equal(avisos[0].destinatario,agente==='keila'?'danielle.lima@gekali.com.br':'acordos.camila@genskeadvogados.com.br')
    assert.deepEqual(avisos[0].payload.email_cc,['edi.neves@gekali.com.br'])
    assert.equal(avisos[0].status,falhaAgenda?'falha':'agendada','Falha de agenda fica registrada sem perder o acordo e o encaminhamento')
    assert.match(avisos[0].conteudo,/Total aceito: R\$ 110,00/)
    assert.match(avisos[0].conteudo,/Aceito os valores e vencimentos/)
    assert.match(avisos[0].conteudo,new RegExp('caso='+id))
    assert.ok(acordo.formalizacao?.aviso_operador_mensagem_id)
    if(agente==='lidia') {assert.match(avisos[0].conteudo,/^Camila,/);assert.match(avisos[0].conteudo,/Genske Advogados/);assert.doesNotMatch(avisos[0].conteudo,/Danielle|GEKALI/)}
   } else assert.equal(acordo.formalizacao?.aviso_operador_mensagem_id,null)
   const atencao=atencaoEtapas({payload:registro,conferida:true,proposta:true,envios:[],hoje:'2026-10-18'})
   assert.equal(atencao['acompanhamento-caso'].alerta?.titulo,'Formalizar na administradora')
   await db.exec('update central_pendencias set payload=payload')
   const repetido=(await db.query<{payload:KeilaCasoPayload}>('select payload from central_pendencias')).rows[0].payload
   assert.deepEqual(repetido,registro,'Atualização posterior não duplica pendências nem evidências')
   await assert.rejects(aceitar('aceito',new Date().toISOString()))
   assert.equal((await db.query<{n:number}>('select count(*)::int n from acordos')).rows[0].n,1,'Repetição não cria segundo acordo')
   assert.equal((await db.query<{n:number}>('select count(*)::int n from mensagens')).rows[0].n,deveAvisar?1:0,'Aviso não se repete em atualizações posteriores')
   registro.acompanhamento!.pendencias[1].resolvida_em='2026-10-18T18:00:00Z'
   assert.equal(formalizacoesPendentes(registro).length,0,'Pendência resolvida deixa de destacar formalização em aberto')
   await db.exec('delete from central_pendencias; delete from acordos; delete from mensagens; delete from condominios;')
  }
  console.log('Keila e Lidia: acordo firmado, encaminhamento atômico, proposta e aceite preservados, pendência única e rollback: OK')
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
