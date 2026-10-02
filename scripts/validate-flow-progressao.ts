import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { primeiraEtapaFlow } from '../features/regua/engine'
import { applyFlowJobProtection } from './flow-job-test-schema'

test('novo flow começa pela primeira etapa ativa em e-mail e WhatsApp', () => {
  for (const delays of [[15, 7, 0], [10, 5, 1]]) {
    const etapas = delays.map((delay, ordem) => ({ id: String(delay), delay_dias: delay, ordem, ativo: true }))
    assert.equal(primeiraEtapaFlow(etapas as any)?.delay_dias, delays[2])
    etapas[2].ativo = false
    assert.equal(primeiraEtapaFlow(etapas as any)?.delay_dias, delays[1])
  }
})

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
test('progressão parte do envio confirmado, respeita prazo, deduplica, retoma e valida antes de ativar', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table carteiras(id uuid primary key);
      create table condominios(id uuid primary key,carteira_id uuid,status text);
      create table reguas(id uuid primary key,ativo boolean default true,status text);
      create table regua_etapas(id uuid primary key,regua_id uuid,ativo boolean default true,delay_dias int,ordem int);
      create table lotes(id uuid primary key default gen_random_uuid(),carteira_id uuid,regua_id uuid,tipo text,status text,iniciado_em timestamptz,observacoes text);
      create table cobranca_flows(id uuid primary key default gen_random_uuid(),carteira_id uuid,lote_id uuid unique,regua_id uuid,nome text,status text,total_mensagens int,total_pendentes int,payload jsonb,criado_por uuid);
      create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,status_operacional text);
      create table acordos(cobranca_id uuid,status text);
      create table mensagens(id uuid primary key,lote_id uuid,cobranca_id uuid,status text,status_operacional text,cobranca_flow_id uuid,regua_etapa_id uuid,payload jsonb default '{}',sent_at timestamptz,enviada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz);
      create table lote_itens(lote_id uuid,cobranca_id uuid,status text,cobranca_flow_id uuid,mensagem_id uuid);
      create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$
        select not exists(select 1 from cobrancas c where c.id=m.cobranca_id and c.status_operacional<>'em_cobranca_ativa')
      $$;
      create function email_ativar_flow(f uuid,r text,u uuid) returns integer language plpgsql as $$ begin
        update mensagens set status='agendada' where cobranca_flow_id=f;
        update cobranca_flows set status='em_execucao' where id=f; return 1;
      end $$;
    `)
    const sql = readFileSync('supabase/migrations/20260929010000_flow_progressao_primeiro_envio.sql', 'utf8').split('create function public.flow_progressao_tick()')[0]
    await db.exec(sql + 'commit;')
    await applyFlowJobProtection(db)
    await db.exec(`insert into carteiras values('${id(1)}');
      insert into condominios values('${id(2)}','${id(1)}','ativo');
      insert into reguas(id) values('${id(3)}');
      insert into regua_etapas(id,regua_id,delay_dias,ordem) values('${id(4)}','${id(3)}',0,1),('${id(5)}','${id(3)}',7,2),('${id(6)}','${id(3)}',15,3);
      insert into cobrancas values('${id(7)}','${id(1)}','${id(2)}','em_cobranca_ativa'),('${id(8)}','${id(1)}','${id(2)}','em_cobranca_ativa');
      insert into cobranca_flows(id,carteira_id,regua_id,nome,status) values('${id(9)}','${id(1)}','${id(3)}','Origem','concluido');
      insert into mensagens(id,cobranca_id,cobranca_flow_id,regua_etapa_id,status,sent_at)
      values('${id(10)}','${id(7)}','${id(9)}','${id(4)}','falha',null);
      insert into lote_itens(cobranca_id,mensagem_id,status) values('${id(7)}','${id(10)}','enviado'),('${id(8)}','${id(10)}','enviado');
    `)
    assert.equal((await db.query<any>('select flow_progressao_enfileirar() n')).rows[0].n, 0, 'Falha não inicia contagem')
    await db.exec(`update mensagens set status='enviada',sent_at=now() where id='${id(10)}'`)
    assert.equal((await db.query<any>('select flow_progressao_enfileirar() n')).rows[0].n, 1)
    assert.equal((await db.query<any>('select flow_progressao_enfileirar() n')).rows[0].n, 0, 'Reexecução é idempotente')
    const job = (await db.query<any>('select *,extract(epoch from prevista_em-primeiro_envio_em)/86400 dias from flow_progressao')).rows[0]
    assert.equal(Number(job.dias), 7)
    assert.deepEqual(job.cobranca_ids, [id(7), id(8)], 'Consolidação preserva todas as cobranças')
    assert.equal((await db.query('select * from flow_progressao_claim()')).rows.length, 0, 'Não libera antes de D+7')
    await db.exec(`update flow_progressao set prevista_em=now()-interval '1 minute'; update cobranca_flows set status='pausado'`)
    assert.equal((await db.query('select * from flow_progressao_claim()')).rows.length, 0, 'Pausa impede continuação')
    await db.exec(`update cobranca_flows set status='concluido'`)
    const first = (await db.query<any>('select * from flow_progressao_claim()')).rows[0]
    assert.ok(first.lote_id)
    assert.equal((await db.query('select * from flow_progressao_claim()')).rows.length, 0, 'Lease impede concorrência')
    await db.exec(`update flow_progressao set lease_ate=now()-interval '1 minute'`)
    const resumed = (await db.query<any>('select * from flow_progressao_claim()')).rows[0]
    assert.equal(resumed.lote_id, first.lote_id)
    assert.notEqual(resumed.token, first.token)
    await assert.rejects(db.query('select flow_progressao_finalizar($1,$2,$3)', [job.id, first.token, 'sender']), /expirada/)
    await db.query(`insert into mensagens(id,lote_id,cobranca_id,regua_etapa_id,status,payload) values($1,$2,$3,$4,'pendente_aprovacao',$5)`,
      [id(11), first.lote_id, id(7), id(5), JSON.stringify({ primeiro_envio_em: job.primeiro_envio_em })])
    await db.query(`insert into lote_itens(lote_id,cobranca_id,mensagem_id,status) values($1,$2,$3,'criado')`, [first.lote_id, id(7), id(11)])
    await db.exec(`insert into acordos values('${id(8)}','ativo')`)
    await assert.rejects(db.query('select flow_progressao_finalizar($1,$2,$3)', [job.id, resumed.token, 'sender']), /acordo/)
    await db.exec('delete from acordos')
    const flow = (await db.query<any>('select flow_progressao_finalizar($1,$2,$3) id', [job.id, resumed.token, 'sender'])).rows[0].id
    assert.ok(flow)
    assert.equal((await db.query<any>(`select status from mensagens where id='${id(11)}'`)).rows[0].status, 'agendada')
    assert.equal((await db.query<any>('select flow_progressao_enfileirar() n')).rows[0].n, 0, 'D+15 aguarda confirmação de D+7')
    await db.exec(`update mensagens set status='enviada',sent_at=now() where id='${id(11)}'`)
    assert.equal((await db.query<any>('select flow_progressao_enfileirar() n')).rows[0].n, 1)
    const next = (await db.query<any>(`select extract(epoch from prevista_em-primeiro_envio_em)/86400 dias,primeiro_envio_em from flow_progressao where etapa_id='${id(6)}'`)).rows[0]
    assert.equal(Number(next.dias), 15, 'D+15 usa primeiro envio, não D+7')
    assert.equal(new Date(next.primeiro_envio_em).toISOString(), new Date(job.primeiro_envio_em).toISOString())
    await db.exec(`update cobranca_flows set status='cancelado' where id='${flow}'`)
    await db.query('select * from flow_progressao_claim()')
    assert.equal((await db.query<any>(`select status from flow_progressao where etapa_id='${id(6)}'`)).rows[0].status, 'cancelado')

    // The migration disables both cron jobs and never exposes internal state.
    assert.deepEqual((await db.query<any>('select active from cron.job order by jobid')).rows.map(r => r.active), [false, false])
    await db.exec('set role anon')
    await assert.rejects(db.query("select flows_job_reservar('montar')"), /permission denied/)
    await assert.rejects(db.query('select * from flows_jobs_controle'), /permission denied/)
    await db.exec('reset role; set role service_role')
    const reserve = async (name: string) => (await db.query<any>('select flows_job_reservar($1) token', [name])).rows[0].token
    const finish = async (name: string, token: string, success: boolean) => (await db.query<any>('select flows_job_concluir($1,$2,$3) ok', [name, token, success])).rows[0].ok
    const montagem = await reserve('montar')
    assert.ok(montagem)
    assert.equal(await reserve('montar'), null, 'Não sobrepõe duas instâncias da mesma rota')
    assert.equal(await reserve('progredir'), null, 'Não sobrepõe montagem e progressão')
    assert.equal(await finish('progredir', montagem, true), false, 'Token não libera outro job')
    assert.equal(await finish('montar', montagem, true), true)
    const progressao = await reserve('progredir')
    assert.ok(progressao)
    assert.equal(await finish('progredir', progressao, false), true)
    assert.equal(await reserve('montar'), null, 'Falha pausa a carga das duas rotas')
    let cooldown = (await db.query<any>("select extract(epoch from proxima_execucao-now()) segundos from flows_jobs_controle where chave='progredir'")).rows[0].segundos
    assert.ok(Number(cooldown) > 115 && Number(cooldown) <= 120)
    await db.exec("update flows_jobs_controle set proxima_execucao=now()-interval '1 second'")
    const retry = await reserve('progredir')
    assert.ok(retry)
    await finish('progredir', retry, false)
    cooldown = (await db.query<any>("select extract(epoch from proxima_execucao-now()) segundos from flows_jobs_controle where chave='progredir'")).rows[0].segundos
    assert.ok(Number(cooldown) > 235 && Number(cooldown) <= 240, 'Backoff dobra')
    await db.exec("update flows_jobs_controle set proxima_execucao=now()-interval '1 second'")
    const killed = await reserve('progredir')
    assert.ok(killed)
    await db.exec("update flows_jobs_controle set lease_ate=now()-interval '1 second'")
    assert.equal(await finish('progredir', killed, true), false, 'Lease expirado não aceita conclusão')
    assert.equal(await reserve('progredir'), null, 'Worker morto preserva pausa após expirar o lease')
    await db.exec("update flows_jobs_controle set proxima_execucao=now()-interval '1 second'")
    const replacement = await reserve('progredir')
    assert.ok(replacement)
    assert.notEqual(replacement, killed)
    assert.equal(await finish('progredir', killed, true), false, 'Worker antigo não libera reserva nova')
    await finish('progredir', replacement, true)
    assert.equal((await db.query<any>("select falhas from flows_jobs_controle where chave='progredir'")).rows[0].falhas, 0)
    await db.exec('reset role')

    // Discovery drains events; an idle cron does not enqueue HTTP calls.
    await db.query('select flow_progressao_enfileirar()')
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null)
    assert.equal((await db.query<any>('select count(*) n from net.requests')).rows[0].n, 0)
    await db.exec(`update mensagens set status='enviada',sent_at=now() where id='${id(10)}'`)
    assert.ok((await db.query<any>('select flow_progressao_tick() id')).rows[0].id)
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null, 'Não acumula HTTP antes de chegar na Vercel')
    assert.equal((await db.query<any>('select count(*) n from net.requests')).rows[0].n, 1)
    await db.exec("insert into net._http_response values(1,null,false,'SSL connect error')")
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null, 'SSL falha antes da Vercel também gera backoff')
    assert.equal((await db.query<any>("select falhas from flows_jobs_controle where chave='progredir'")).rows[0].falhas, 1)
    await db.exec("update flows_jobs_controle set proxima_execucao=now()-interval '1 second'")
    assert.ok((await db.query<any>('select flow_progressao_tick() id')).rows[0].id)
    await db.exec("insert into net._http_response values(2,500,false,null)")
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null)
    assert.equal((await db.query<any>("select falhas from flows_jobs_controle where chave='progredir'")).rows[0].falhas, 2)
    await db.exec("update flows_jobs_controle set proxima_execucao=now()-interval '1 second'")
    assert.ok((await db.query<any>('select flow_progressao_tick() id')).rows[0].id)
    await db.exec("update flows_jobs_controle set requisicao_ate=now()-interval '1 second'")
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null, 'Resposta ausente após o prazo também pausa')
    assert.equal((await db.query<any>("select falhas from flows_jobs_controle where chave='progredir'")).rows[0].falhas, 3)

    // More than one page of legacy messages advances by 25 without re-scanning
    // on claim. Changes behind the cursor are picked up by the message trigger.
    await db.exec(`insert into mensagens(id,status) select ('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,'falha' from generate_series(1,60) n;
      update flow_progressao_backfill set cursor_id=null,concluido=false;`)
    await db.query('select flow_progressao_enfileirar()')
    const cursor = (await db.query<any>('select cursor_id,concluido from flow_progressao_backfill')).rows[0]
    assert.equal(cursor.concluido, false)
    await db.query('select * from flow_progressao_claim()')
    assert.equal((await db.query<any>('select cursor_id from flow_progressao_backfill')).rows[0].cursor_id, cursor.cursor_id, 'Claim não reconstrói histórico')
    await db.query('select flow_progressao_enfileirar()')
    assert.notEqual((await db.query<any>('select cursor_id from flow_progressao_backfill')).rows[0].cursor_id, cursor.cursor_id)
    await db.query('select flow_progressao_enfileirar()')
    assert.equal((await db.query<any>('select concluido from flow_progressao_backfill')).rows[0].concluido, true)

    await db.exec(`insert into mensagens(id,cobranca_id,cobranca_flow_id,regua_etapa_id,status,sent_at)
      select ('00000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid,'${id(7)}','${id(9)}','${id(4)}','enviada',now()
      from generate_series(1,51) n;`)
    assert.equal(Number((await db.query<any>('select count(*) n from flow_progressao_fontes')).rows[0].n), 51)
    await db.query('select flow_progressao_enfileirar()')
    assert.equal(Number((await db.query<any>('select count(*) n from flow_progressao_fontes')).rows[0].n), 26, 'Eventos são drenados em páginas de 25')
    await db.exec("update flows_jobs_controle set token=null,lease_ate=null,requisicao_id=null,requisicao_ate=null,proxima_execucao=now(),falhas=10,ultimo_job=null")
    const capped = await reserve('progredir')
    await finish('progredir', capped, false)
    cooldown = (await db.query<any>("select extract(epoch from proxima_execucao-now()) segundos from flows_jobs_controle where chave='progredir'")).rows[0].segundos
    assert.ok(Number(cooldown)>1795 && Number(cooldown)<=1800, 'Pausa nunca ultrapassa 30 minutos')

    await db.exec("update flows_jobs_controle set proxima_execucao=now(),falhas=0; insert into maestro_flow_montagens(status) values('pendente')")
    const previousMontagem = await reserve('montar')
    await finish('montar', previousMontagem, true)
    assert.equal((await db.query<any>('select maestro_flow_tick() id')).rows[0].id, null, 'Montagem cede a vez para progressão quando ambas têm fila')
    assert.ok((await db.query<any>('select flow_progressao_tick() id')).rows[0].id)
    const previousProgressao = await reserve('progredir')
    await finish('progredir', previousProgressao, true)
    assert.equal((await db.query<any>('select flow_progressao_tick() id')).rows[0].id, null, 'Progressão também cede a vez')
    assert.ok((await db.query<any>('select maestro_flow_tick() id')).rows[0].id)
  } finally { await db.close() }
})
