import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { priorizarWhatsappSemEmail, responsavelWhatsappSemEmail } from '../features/flows/cobranca/prioridade-whatsapp'
import { planejarFlowsSequenciais } from '../features/flows/cobranca/criacao-sequencial'
import { escolherContatoRegua } from '../features/regua/services/regua-shared'

const migration = readFileSync('supabase/migrations/20261023134005_whatsapp_limite_20_janela_movel_24h.sql', 'utf8')
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
async function main() {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table test_clock(t timestamptz); insert into test_clock values('2026-10-23 13:00:00Z');
      create function test_now() returns timestamptz stable language sql as $$select t from test_clock$$;
      create table carteiras(id uuid primary key,whatsapp_transporte text,whatsapp_web_sessao text,whatsapp_web_numero text);
      create table whatsapp_web_sessoes(id text,numero text,status text,atualizado_em timestamptz);
      create table cobranca_flows(id uuid primary key,status text);
      create table acordo_flows(id uuid primary key,status text);
      create table pre_juridico_flows(id uuid primary key,status text);
      create table mensagens(id uuid primary key,carteira_id uuid,canal text,status text,agendada_para timestamptz,proxima_tentativa_em timestamptz,provider_message_id text,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,lote_id uuid,payload jsonb default '{}',provider text,provider_status text,ultima_tentativa_em timestamptz,tentativas_envio int default 0);
      create table whatsapp_web_envios(token uuid default gen_random_uuid(),mensagem_id uuid,sessao text,numero text,estado text,iniciado_em timestamptz default test_now(),finalizado_em timestamptz,recibos jsonb default '[]');
      create function workers_whatsapp_permitido() returns boolean language sql as $$select true$$;
      create function keila_whatsapp_elegivel(m mensagens) returns boolean language sql as $$select false$$;
      create function whatsapp_consolidar_lote(l uuid) returns void language plpgsql as $$begin end$$;
      create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select true$$;
      create function flow_cancelar_mensagem(m uuid) returns void language plpgsql as $$begin end$$;
    `)
    await db.exec(readFileSync('scripts/fixtures/whatsapp-web-reservar-limite-diario.sql', 'utf8'))
    await db.exec('revoke execute on function whatsapp_web_reservar(text,text) from public,anon,authenticated; grant execute on function whatsapp_web_reservar(text,text) to service_role;')
    await db.exec(migration)
    await db.exec(migration) // Reaplicação não remove guardas nem permissões.
    const definition = (await db.query<any>("select pg_get_functiondef('whatsapp_web_reservar(text,text)'::regprocedure) src")).rows[0].src
    assert(definition.includes("pg_advisory_xact_lock(hashtextextended('whatsapp-web:'||p_numero"))
    assert(definition.includes("greatest(iniciado_em,finalizado_em)>now()-interval '24 hours') >= 20"))
    assert(!definition.includes('>= 50'))
    assert.equal((await db.query<any>("select has_function_privilege('anon','whatsapp_web_reservar(text,text)','execute') ok")).rows[0].ok, false)
    // Apenas o relógio é substituído; a reserva real é executada no banco isolado.
    await db.exec(definition.replaceAll('now()', 'test_now()'))
    const reset = async () => {
      await db.exec(`truncate mensagens,whatsapp_web_envios,carteiras,whatsapp_web_sessoes,cobranca_flows,acordo_flows,pre_juridico_flows;
        update test_clock set t='2026-10-23 13:00:00Z';
        insert into carteiras values('${id(1)}','web','a','5511999991111'),('${id(2)}','web','b','5511999991111'),('${id(3)}','web','c','5511999992222');
        insert into whatsapp_web_sessoes select whatsapp_web_sessao,whatsapp_web_numero,'conectado',test_now() from carteiras;
        insert into cobranca_flows values('${id(10)}','em_execucao'),('${id(11)}','pausado');
        insert into mensagens(id,carteira_id,canal,status,agendada_para,cobranca_flow_id,payload) values('${id(20)}','${id(1)}','whatsapp','agendada','2020-01-01','${id(10)}','{"destinatario_regua":{"email":"contato@example.com"}}');`)
    }
    const seed = async (count: number, age = '12 hours', state = 'enviado', receipts = '[]', finished = 'null') => {
      await db.query(`insert into whatsapp_web_envios(numero,sessao,estado,iniciado_em,finalizado_em,recibos) select '5511999991111','b',$1,test_now()-$2::interval,${finished},$3::jsonb from generate_series(1,$4::int)`, [state, age, receipts, count])
    }
    const reserve = async (session = 'a', number = '5511999991111') => (await db.query<any>('select whatsapp_web_reservar($1,$2) r', [session, number])).rows[0].r

    await reset(); await seed(20)
    assert.equal(await reserve(), null, '20 envios de ontem ainda bloqueiam a fila atrasada de hoje')
    assert.equal((await db.query<any>('select count(*)::int n from whatsapp_web_envios')).rows[0].n, 20)
    await reset(); await seed(19)
    assert.equal((await reserve()).id, id(20), 'a vigésima vaga está disponível')
    await db.exec("update whatsapp_web_envios set estado='enviado',iniciado_em=test_now()-interval '2 minutes' where estado='reservado'")
    assert.equal(await reserve(), null, 'a vigésima primeira reserva é bloqueada')
    await reset(); await seed(20, '23 hours 59 minutes')
    assert.equal(await reserve(), null)
    await db.exec("update test_clock set t=t+interval '1 minute';update whatsapp_web_sessoes set atualizado_em=test_now()")
    assert.equal((await reserve()).id, id(20), 'a vaga retorna ao completar 24h, sem depender da meia-noite')
    await reset(); await seed(20, '26 hours', 'enviado', '[]', "test_now()-interval '2 hours'")
    assert.equal(await reserve(), null, 'conclusão tardia não libera cota antes de 24h')
    for (const [state, receipts, blocked] of [['falha', '[]', false], ['falha', '["recibo"]', true], ['incerto', '[]', true]] as const) {
      await reset(); await seed(20, '12 hours', state, receipts)
      assert.equal(Boolean(await reserve()), !blocked, `${state} / ${receipts}`)
    }
    await reset(); await seed(20)
    await db.exec(`update mensagens set carteira_id='${id(2)}';`)
    assert.equal(await reserve('b'), null, 'outra sessão/carteira compartilha o teto do mesmo número')
    await db.exec(`update mensagens set carteira_id='${id(3)}';`)
    assert.equal((await reserve('c','5511999992222')).id,id(20), 'outro número tem sua própria cota')
    await reset()
    await db.exec(`insert into mensagens(id,carteira_id,canal,status,agendada_para,cobranca_flow_id,payload) values
      ('${id(21)}','${id(1)}','whatsapp','agendada','2026-10-22','${id(10)}','{"destinatario_regua":{"email":null}}'),
      ('${id(22)}','${id(1)}','whatsapp','agendada','2019-01-01','${id(11)}','{"destinatario_regua":{"email":null}}');`)
    assert.equal((await reserve()).id,id(21),'sem e-mail tem prioridade sobre atrasado com e-mail; pausado fica fora')
    assert.equal((await db.query<any>('select status from cobranca_flows where id=$1',[id(11)])).rows[0].status,'pausado')
    assert.equal((await db.query<any>('select status from mensagens where id=$1',[id(22)])).rows[0].status,'agendada')

    const rows = [{ id:'email',unidade_id:'u1',carteira_id:'c',condominio_id:'a',whatsapp_sem_email:false },{ id:'sem1',unidade_id:'u2',carteira_id:'c',condominio_id:'b',whatsapp_sem_email:true },{ id:'sem2',unidade_id:'u3',carteira_id:'c',condominio_id:'b',whatsapp_sem_email:true }]
    assert.deepEqual(priorizarWhatsappSemEmail(rows,'whatsapp').map(r=>r.id),['sem1','sem2','email'])
    assert.equal(priorizarWhatsappSemEmail(rows,'email'),rows)
    assert.equal(planejarFlowsSequenciais(rows,{a:'r',b:'r'},'whatsapp')[0].condominioId,'b')
    const contato = escolherContatoRegua({ unidade:{ responsavel_nome:'Proprietário',email:'proprietario@example.com',telefone:'11999991111' },apoios:[{responsavel_nome:'Inquilino',tipo_responsavel:'inquilino',telefone:'11999992222',email:null}],canal:'whatsapp',preferencia:'inquilino' })
    assert.equal(responsavelWhatsappSemEmail(contato),true,'prioridade pertence ao responsável escolhido, não ao e-mail de outra pessoa da unidade')
    assert.equal(responsavelWhatsappSemEmail({email:null,destinatario:null}),false)
    console.log('OK: limite móvel 20/24h, meia-noite, fronteira de 24h, conclusão tardia, estados incertos, número compartilhado, prioridade sem e-mail e flows pausados — somente dados sintéticos.')
  } finally { await db.close() }
}
main().catch(error => { console.error(error); process.exitCode=1 })
