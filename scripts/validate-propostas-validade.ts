import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { gerarConferenciaProposta } from '../features/keila/conferencia-proposta-service'
import { PGlite } from '@electric-sql/pglite'
import { fimPeriodoProposta, validarVencimentoProposta, validadeProposta, situacaoValidadeProposta } from '../features/agentes-virtuais/validade-proposta'

async function main() {
  for (const [hoje, fim] of [['2026-10-18', '2026-11-10'], ['2026-11-10', '2026-11-10'], ['2026-11-11', '2026-12-10'], ['2026-12-31', '2027-01-10'], ['2028-02-29', '2028-03-10']]) {
    const agora = new Date(`${hoje}T15:00:00Z`)
    assert.equal(fimPeriodoProposta(agora), fim)
    assert.doesNotThrow(() => validarVencimentoProposta(fim, agora))
    assert.throws(() => validarVencimentoProposta(`${fim.slice(0, 8)}11`, agora), /período/)
  }
  assert.equal(fimPeriodoProposta(new Date('2026-11-11T01:00:00Z')), '2026-11-10', 'Limite usa Brasília')
  assert.throws(() => validarVencimentoProposta('2026-02-30'), /inválido/)
  assert.equal(validadeProposta('2026-10-18T02:30:00Z').toISOString(), '2026-10-25T02:30:00.000Z')
  const s = situacaoValidadeProposta('2026-10-18T02:30:00Z', '2026-10-20', new Date('2026-10-23T15:00:00Z'))
  assert.equal(s.expirada, false)
  assert.equal(s.vencimentoPassou, true)
  assert.equal(s.lembrarHoje, false, 'Vencimento passado exige nova proposta, sem encurtar os 7 dias')

  const hoje = new Date('2026-10-18T15:00:00Z')
  const cabecalho: unknown[] = Array(26).fill(''); cabecalho[4] = 'Unidade'; cabecalho[10] = '200035'; cabecalho[12] = 'TESTE'
  const linha: unknown[] = Array(26).fill(''); linha[8] = '10/09/2026'; linha[21] = 100
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([cabecalho, linha]), 'Inadimplentes')
  const buffer = XLSX.write(workbook, {type:'buffer',bookType:'xlsx'})
  let dataColeta = hoje.toISOString()
  const fonte = {
    from(tabela: string) {
      const dados = () => ({agente_execucoes:{id:'exec',status:'sucesso',created_at:dataColeta},agente_arquivos:{id:'arquivo',nome_arquivo:'relatorio.xlsx',storage_path:'exec/relatorio.xlsx'},unidades:{id:'unidade',identificacao:'200035',responsavel_nome:'TESTE',email:'destino@example.com',acao_judicial:false},cobrancas:[{id:'cota',vencimento:'2026-09-10',valor_atualizado:100,status_financeiro:'em_aberto',status_operacional:'em_cobranca_ativa'}],condominios:{nome:'Condomínio',administradora:'Lello',dias_apos_vencimento_regua:30,despesas_acordo_avista_percentual:10,despesas_acordo_parcelado_percentual:20,parcelas_acordo_sem_aprovacao_sindico:3}})[tabela]
      const q = {select(){return q},eq(){return q},single:async()=>({data:dados()}),then(resolve: (v:unknown)=>unknown){return Promise.resolve({data:dados()}).then(resolve)}}
      return q
    },
    storage:{from:()=>({download:async()=>({data:new Blob([buffer])})})}
  }
  const caso = {condominio_id:'condominio',carteira_id:'carteira',payload:{unidade_ids:['unidade'],execucao_id:'exec',emails:[{chave:'email1',nome:'Teste',remetente:'destino@example.com',assunto:'Proposta'}]}}
  for (const tipo of ['keila_atendimento','lidia_atendimento']) {
    const proposta = await gerarConferenciaProposta(fonte as never,{...caso,tipo} as never,{arquivo_id:'arquivo',quantidade:2,vencimento:'2026-11-05'},hoje)
    assert.equal(proposta.validade_regra,'sete_dias_v1'); assert.match(proposta.texto,/validade de 7 dias a partir do envio/)
    assert.match(proposta.texto,tipo==='lidia_atendimento'?/Lidia \| Genske Advogados/:/Keila \| GEKALI/)
    assert.equal(proposta.plano.parcelado.parcelas[1].vencimento,'2026-12-05','Só o primeiro vencimento é limitado ao período')
  }
  const historica = await gerarConferenciaProposta(fonte as never,caso as never,{arquivo_id:'arquivo',quantidade:2,vencimento:'2026-11-05'},hoje,true)
  assert.equal(historica.validade_regra,undefined); assert.doesNotMatch(historica.texto,/validade de 7 dias/)
  dataColeta='2026-10-17T15:00:00Z'
  await assert.rejects(gerarConferenciaProposta(fonte as never,caso as never,{arquivo_id:'arquivo',quantidade:2,vencimento:'2026-11-05'},hoje),/mesmo dia/)

  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table mensagens(id uuid primary key,carteira_id uuid,contexto text,canal text,status text,status_operacional text,destinatario text,email_assunto text,conteudo text,conteudo_renderizado text,aprovado_em timestamptz,enviada_em timestamptz,erro_envio text,payload jsonb);
      create table central_pendencias(id uuid,carteira_id uuid,condominio_id uuid,tipo text,status text,payload jsonb);
      create table unidades(id uuid,carteira_id uuid,condominio_id uuid,acao_judicial boolean,email text);
      create table cobrancas(id uuid,carteira_id uuid,duplicada_de_id uuid,status_financeiro text,automacao_bloqueada boolean,status_operacional text);
      create table acordos(unidade_id uuid,carteira_id uuid,status text);
      create table email_agenda(mensagem_id uuid,remetente text);
      create table email_tentativas(mensagem_id uuid,remetente text,estado text,iniciado_em timestamptz);
      create table teste_bloqueio(ativo boolean); insert into teste_bloqueio values(false);
      create function email_destino_invalido(uuid,text) returns boolean language sql as $$select ativo from public.teste_bloqueio$$;
      create function email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz default now()) returns timestamptz language plpgsql as $$begin update public.mensagens set status='agendada' where id=p_mensagem; return now(); end$$;
      create function flow_cancelar_mensagem(uuid) returns void language sql as $$update public.mensagens set status='cancelada' where id=$1$$;
      create function email_reservar_disparo_interno(p_mensagem uuid,p_remetente text) returns jsonb language plpgsql as $$declare m public.mensagens; begin select * into strict m from public.mensagens where id=p_mensagem for update; return '{"permitido":true}'; end$$;
      create function thunderbird_iniciar(uuid,uuid) returns boolean language plpgsql as $$declare m mensagens; e record; begin select $2 as mensagem_id into e; select * into strict m from mensagens where id=e.mensagem_id for update; return true; end$$;
      create function agente_virtual_negociar_acordo(p_agente text,p_caso uuid,p_unidade uuid,p_operacao text,p_dados jsonb,p_evidencia text) returns jsonb language plpgsql as $$declare caso central_pendencias; dados jsonb; n integer; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; begin select * into caso from public.central_pendencias where id=p_caso; dados:=p_dados; n:=jsonb_array_length(dados->'parcelas'); if p_operacao='aceitar' and n>1 then return '{}'; end if; return '{}'; end$$;
      create table agente_execucoes(id uuid,condominio_id uuid,carteira_id uuid,status text,created_at timestamptz);
      create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
    `)
    await db.exec(readFileSync('supabase/migrations/20261019002458_validade_propostas_agentes.sql', 'utf8'))
    await db.exec(`
      insert into unidades values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004',false,'destino@example.com');
      insert into cobrancas values('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',null,'em_aberto',false,'em_cobranca_ativa');
      insert into central_pendencias values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','keila_atendimento','em_tratamento',jsonb_build_object(
        'estado','aguardando_retorno','unidade_ids',jsonb_build_array('00000000-0000-0000-0000-000000000003'), 'emails','[]'::jsonb,
        'resposta_email_chave','email1','resposta_aprovada',jsonb_build_object('mensagem_id','00000000-0000-0000-0000-000000000006','texto','Proposta aprovada','em',now()-interval '7 days'),
        'conferencia_proposta',jsonb_build_object('hash','versao1','plano',jsonb_build_object('incluidas',jsonb_build_array(jsonb_build_object('cobranca_id','00000000-0000-0000-0000-000000000005'))))));
      insert into mensagens(id,carteira_id,canal,status,destinatario,conteudo,enviada_em,payload) values('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','email','enviada','destino@example.com','Proposta aprovada',now()-interval '6 days',jsonb_build_object('keila_caso_id','00000000-0000-0000-0000-000000000001','proposta_validade',jsonb_build_object('regra','sete_dias_v1','primeiro_vencimento',(now()+interval '2 days')::date,'email_chave','email1','hash','versao1')));
      insert into email_tentativas values('00000000-0000-0000-0000-000000000006','example.com','enviado',now()-interval '6 days');
    `)
    const pode = async () => (await db.query<{ ok: boolean }>("select agente_proposta_pode_lembrar('00000000-0000-0000-0000-000000000006') ok")).rows[0].ok
    assert.equal(await pode(), true)
    for (const [modificar, restaurar] of [
      ["update central_pendencias set payload=jsonb_set(payload,'{estado}','\"atendimento_humano\"')", "update central_pendencias set payload=jsonb_set(payload,'{estado}','\"aguardando_retorno\"')"],
      ['update unidades set acao_judicial=true', 'update unidades set acao_judicial=false'],
      ['update teste_bloqueio set ativo=true', 'update teste_bloqueio set ativo=false'],
      ["update cobrancas set status_financeiro='quitado'", "update cobrancas set status_financeiro='em_aberto'"],
      ["update public.mensagens set enviada_em=now()-interval '7 days'", "update public.mensagens set enviada_em=now()-interval '6 days'"],
      ["update central_pendencias set payload=jsonb_set(payload,'{emails}',jsonb_build_array(jsonb_build_object('chave','novo','recebido_em',now())))", "update central_pendencias set payload=jsonb_set(payload,'{emails}','[]')"],
      ["update central_pendencias set payload=jsonb_set(payload,'{conferencia_proposta,hash}','\"nova-versao\"')", "update central_pendencias set payload=jsonb_set(payload,'{conferencia_proposta,hash}','\"versao1\"')"],
      ["insert into acordos values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','ativo')", 'delete from acordos'],
    ]) {
      await db.exec(modificar); assert.equal(await pode(), false, modificar); await db.exec(restaurar)
    }
    const negociar = (operacao: string, vencimento: string) => db.query("select agente_virtual_negociar_acordo('keila','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',$1,$2::jsonb,'Teste')",[operacao,JSON.stringify({parcelas:[{vencimento}]})])
    const fim = fimPeriodoProposta(new Date())
    await assert.rejects(negociar('propor',`${fim.slice(0,8)}11`),/período corrente/)
    await assert.rejects(negociar('propor',fim),/relatório de hoje/)
    await db.exec("update mensagens set enviada_em=now()-interval '8 days'")
    await assert.rejects(negociar('aceitar',fim),/fora da validade/)
    await db.exec("update mensagens set enviada_em=now()-interval '6 days'")
    assert.equal((await db.query<{ n: number }>('select agentes_preparar_lembretes_propostas() n')).rows[0].n, 1)
    assert.equal((await db.query<{ n: number }>('select agentes_preparar_lembretes_propostas() n')).rows[0].n, 0, 'Uma mensagem por versão, inclusive em nova execução')
    const lembrete = (await db.query<{ corpo: string; ok: boolean }>("select conteudo corpo,agente_proposta_mensagem_elegivel(m) ok from mensagens m where payload ? 'lembrete_proposta'")).rows[0]
    assert.match(lembrete.corpo, /vence amanhã/); assert.equal(lembrete.ok, true)
    await db.exec('update unidades set acao_judicial=true')
    assert.equal((await db.query<{r:{permitido:boolean}}>("select email_reservar_disparo_interno(id,'example.com') r from mensagens where payload ? 'lembrete_proposta'")).rows[0].r.permitido,false,'SMTP bloqueia lembrete após mudança')
    assert.equal((await db.query<{r:boolean}>("select thunderbird_iniciar(id,id) r from mensagens where payload ? 'lembrete_proposta'")).rows[0].r,false,'Thunderbird também bloqueia')
    assert.equal((await db.query<{ ok: boolean }>("select agente_proposta_mensagem_elegivel(m) ok from mensagens m where payload ? 'lembrete_proposta'")).rows[0].ok, false, 'Reconfere no disparo, depois de enfileirar')
    assert.equal((await db.query<{ permitido: boolean }>("select has_function_privilege('authenticated','public.agentes_preparar_lembretes_propostas()','execute') permitido")).rows[0].permitido, false)
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from mensagens where conteudo='Proposta aprovada' and status='enviada'")).rows[0].n, 1, 'Original preservado')
    console.log('Validade, período, lembrete, deduplicação e bloqueios: OK')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
