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
  const id='00000000-0000-0000-0000-000000000001',unidade='00000000-0000-0000-0000-000000000002'
  const proposta={id:'proposta-original',unidade_id:unidade,unidade:'35',etapa:'possivel_acordo',base:100,despesas:10,total:110,percentual:10,parcelas:[{numero:1,valor:110,vencimento:'2026-11-05'}]}
  const original={versao:1,estado:'proposta_preparada',acordos:[proposta],resposta_aprovada:{texto:'texto aprovado',mensagem_id:'mensagem-original'},atividades:[],acompanhamento:{conversas:[{message_id:'original'}],pendencias:[{id:'anterior',tipo:'proposta',prazo:'2026-10-20',proxima_acao:'Preservar'}]}}
  for(const agente of ['keila','lidia']) {
   await db.query("insert into central_pendencias values($1,$2,'00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','em_tratamento','',$3::jsonb,'2026-10-18T12:00:00Z')",[id,`${agente}_atendimento`,JSON.stringify(original)])
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
   const atencao=atencaoEtapas({payload:registro,conferida:true,proposta:true,envios:[],hoje:'2026-10-18'})
   assert.equal(atencao['acompanhamento-caso'].alerta?.titulo,'Formalizar na administradora')
   await db.exec('update central_pendencias set payload=payload')
   const repetido=(await db.query<{payload:KeilaCasoPayload}>('select payload from central_pendencias')).rows[0].payload
   assert.deepEqual(repetido,registro,'Atualização posterior não duplica pendências nem evidências')
   await assert.rejects(aceitar('aceito',new Date().toISOString()))
   assert.equal((await db.query<{n:number}>('select count(*)::int n from acordos')).rows[0].n,1,'Repetição não cria segundo acordo')
   registro.acompanhamento!.pendencias[1].resolvida_em='2026-10-18T18:00:00Z'
   assert.equal(formalizacoesPendentes(registro).length,0,'Pendência resolvida deixa de destacar formalização em aberto')
   await db.exec('delete from central_pendencias; delete from acordos;')
  }
  console.log('Keila e Lidia: acordo firmado, encaminhamento atômico, proposta e aceite preservados, pendência única e rollback: OK')
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
