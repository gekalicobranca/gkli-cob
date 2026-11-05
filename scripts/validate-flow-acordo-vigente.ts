import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { applyFlowJobProtection } from './flow-job-test-schema'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const migration = readFileSync('supabase/migrations/20261105111008_flows_cancelar_acordo_vigente.sql', 'utf8')

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table carteiras(id uuid primary key);
    create table condominios(id uuid primary key,carteira_id uuid,status text);
    create table reguas(id uuid primary key,ativo boolean default true,status text);
    create table regua_etapas(id uuid primary key,regua_id uuid,ativo boolean default true,delay_dias int,ordem int);
    create table lotes(id uuid primary key default gen_random_uuid(),carteira_id uuid,regua_id uuid,tipo text,
      status text,iniciado_em timestamptz,observacoes text,cancelado_em timestamptz,motivo_cancelamento text);
    create table cobranca_flows(id uuid primary key default gen_random_uuid(),carteira_id uuid,lote_id uuid unique,
      regua_id uuid,nome text,status text,total_mensagens int,total_pendentes int,total_agendadas int,
      total_falhas int,proximo_disparo_em timestamptz,concluido_em timestamptz,payload jsonb,criado_por uuid);
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,status_operacional text);
    create table acordos(id uuid primary key default gen_random_uuid(),unidade_id uuid,cobranca_id uuid,status text);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
    create table mensagens(id uuid primary key,lote_id uuid,cobranca_id uuid,carteira_id uuid,contexto text,
      acordo_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,canal text,status text,status_operacional text,
      cobranca_flow_id uuid,regua_etapa_id uuid,payload jsonb default '{}',sent_at timestamptz,enviada_em timestamptz,
      enviado_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,proxima_tentativa_em timestamptz,
      cancelado_em timestamptz,cancelada_em timestamptz,motivo_cancelamento text,erro text,
      provider_message_id text,provider_status text);
    create table lote_itens(lote_id uuid,cobranca_id uuid,status text,cobranca_flow_id uuid,mensagem_id uuid,
      cancelado_em timestamptz,motivo text);
    create table email_agenda(mensagem_id uuid primary key);
    create table email_tentativas(mensagem_id uuid,estado text);
    create table whatsapp_web_envios(mensagem_id uuid,estado text);
    create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,
      titulo text,descricao text,antes jsonb,depois jsonb);
    create function acordo_parcela_mensagem_elegivel(m mensagens) returns boolean language sql as $$
      select not coalesce((m.payload->>'parcela_bloqueada')::boolean,false) $$;
    create function mensagem_contem_cobranca_arquivada(m mensagens) returns boolean language sql as $$
      select coalesce((m.payload->>'arquivada')::boolean,false) $$;
    create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$
      select public.acordo_parcela_mensagem_elegivel(m) and not public.mensagem_contem_cobranca_arquivada(m)
        and not coalesce((m.payload->>'bloqueio_existente')::boolean,false) $$;
    create function email_ativar_flow(f uuid,r text,u uuid) returns integer language plpgsql as $$
      begin raise exception 'Envio indevido no cenário de acordo'; end $$;
  `)
  const progressao = readFileSync('supabase/migrations/20260929010000_flow_progressao_primeiro_envio.sql', 'utf8')
  await db.exec(progressao.split('create function public.flow_progressao_tick()')[0] + 'commit;')
  await applyFlowJobProtection(db)
  const cancelamento = readFileSync('supabase/migrations/20260918150000_flow_bloqueio_status.sql', 'utf8')
    .split('create or replace function public.flow_cancelar_mensagem')[1]
    .split('create or replace function public.flow_cancelar_apos_status_cobranca')[0]
  await db.exec('create or replace function public.flow_cancelar_mensagem' + cancelamento)
  await db.exec(migration)
  await db.exec(`
    insert into carteiras values('${id(1)}');
    insert into condominios values('${id(2)}','${id(1)}','ativo');
    insert into reguas(id) values('${id(3)}');
    insert into regua_etapas values('${id(4)}','${id(3)}',true,0,1),('${id(5)}','${id(3)}',true,7,2);
    insert into cobrancas values
      ('${id(10)}','${id(1)}','${id(2)}','${id(100)}','em_cobranca_ativa'),
      ('${id(11)}','${id(1)}','${id(2)}','${id(100)}','em_cobranca_ativa'),
      ('${id(12)}','${id(1)}','${id(2)}','${id(101)}','em_cobranca_ativa');
    insert into cobranca_flows(id,carteira_id,regua_id,nome,status)
      values('${id(20)}','${id(1)}','${id(3)}','Origem','concluido');
  `)
  return db
}

test('acordo vigente protege a unidade por cadastro, vínculo direto e composição, com estados encerrados liberados', async () => {
  const db = await fixture()
  try {
    for (const link of ['unidade', 'direto', 'composicao']) {
      await db.exec('delete from acordo_cobrancas; delete from acordos;')
      await db.query('insert into acordos(id,unidade_id,cobranca_id,status) values($1,$2,$3,$4)',
        [id(30), link === 'unidade' ? id(100) : null, link === 'direto' ? id(11) : null, 'ativo'])
      if (link === 'composicao') await db.query('insert into acordo_cobrancas values($1,$2)', [id(30), id(11)])
      for (const status of ['ativo', 'em_dia', 'em_atraso', 'quitado', 'cancelado', 'quebrado', 'renegociado']) {
        await db.query('update acordos set status=$1', [status])
        const result = await db.query<{ bloqueado: boolean; outra: boolean }>(
          'select flow_cobrancas_tem_acordo_vigente($1) bloqueado,flow_cobrancas_tem_acordo_vigente($2) outra',
          [[id(10)], [id(12)]])
        assert.equal(result.rows[0].bloqueado, ['ativo', 'em_dia', 'em_atraso'].includes(status), `${link} ${status}`)
        assert.equal(result.rows[0].outra, false)
        const blocked = await db.query<{ flow_cobrancas_bloqueadas_por_acordo: string }>(
          'select * from flow_cobrancas_bloqueadas_por_acordo($1)', [[id(10), id(11), id(12)]])
        assert.deepEqual(blocked.rows.map(r => r.flow_cobrancas_bloqueadas_por_acordo).sort(),
          ['ativo', 'em_dia', 'em_atraso'].includes(status) ? [id(10), id(11)] : [])
      }
    }
  } finally { await db.close() }
})

test('ciclo cancela cobrança consolidada, mantém outra unidade, histórico, acordo e tentativas incertas', async () => {
  const db = await fixture()
  try {
    await db.exec(`insert into acordos(id,unidade_id,status) values('${id(30)}','${id(100)}','ativo');`)
    const kinds = ['pendente_aprovacao', 'agendada', 'enviada', 'incerto', 'reservado', 'em_envio', 'acordo', 'outra', 'consolidada', 'itens', 'falha', 'provider']
    for (const [index, kind] of kinds.entries()) {
      const msg = id(200 + index)
      const status = kind === 'enviada' ? 'enviada' : kind === 'falha' ? 'falha' : 'pendente_aprovacao'
      const charge = ['outra', 'consolidada', 'itens'].includes(kind) ? id(12) : id(10)
      const payload = kind === 'consolidada' ? { cobranca_ids: [id(11)] } : {}
      await db.query(`insert into mensagens(id,cobranca_id,carteira_id,contexto,canal,status,status_operacional,
        payload,cobranca_flow_id,regua_etapa_id,sent_at,acordo_id,provider_message_id) values($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12)`,
        [msg, charge, id(1), kind === 'acordo' ? 'acordo' : 'cobranca', index % 2 ? 'whatsapp' : 'email', status,
          JSON.stringify(payload), kind === 'acordo' ? null : id(20), id(4), kind === 'enviada' ? new Date() : null,
          kind === 'acordo' ? id(30) : null, kind === 'provider' ? 'confirmado' : null])
      await db.query('insert into email_agenda values($1)', [msg])
      if (kind === 'itens') await db.query('insert into lote_itens(mensagem_id,cobranca_id,status) values($1,$2,$3)', [msg, id(11), 'criado'])
      if (['incerto', 'reservado'].includes(kind)) await db.query('insert into whatsapp_web_envios values($1,$2)', [msg, kind])
      if (kind === 'em_envio') await db.query('insert into email_tentativas values($1,$2)', [msg, kind])
    }
    assert.equal((await db.query<{ n: number }>('select flow_cobranca_cancelar_acordos_vigentes() n')).rows[0].n, 5)
    for (const [index, kind] of kinds.entries()) {
      const m = (await db.query<{ status: string }>('select status from mensagens where id=$1', [id(200 + index)])).rows[0]
      const removed = ['pendente_aprovacao', 'agendada', 'consolidada', 'itens', 'falha'].includes(kind)
      assert.equal(m.status === 'cancelada', removed, kind)
      assert.equal((await db.query('select * from email_agenda where mensagem_id=$1', [id(200 + index)])).rows.length, removed ? 0 : 1)
    }
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 5)
    assert.equal((await db.query<{ n: number }>('select flow_cobranca_cancelar_acordos_vigentes() n')).rows[0].n, 0, 'Idempotência')
    const snapshot = (await db.query<{ antes: { mensagem: { status: string } } }>('select antes from auditoria_eventos limit 1')).rows[0]
    assert.notEqual(snapshot.antes.mensagem.status, 'cancelada')
    await db.exec('delete from acordos')
    await db.query('select flow_cobranca_cancelar_acordos_vigentes()')
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from mensagens where status='cancelada'")).rows[0].n, 5)
  } finally { await db.close() }
})

test('continuação com acordo durante a montagem termina cancelada e não volta para atenção', async () => {
  const db = await fixture()
  try {
    await db.exec(`
      insert into mensagens(id,cobranca_id,carteira_id,contexto,status,cobranca_flow_id,regua_etapa_id,sent_at)
        values('${id(200)}','${id(10)}','${id(1)}','cobranca','enviada','${id(20)}','${id(4)}',now()-interval '8 days');
    `)
    assert.equal((await db.query<{ n: number }>('select flow_progressao_enfileirar() n')).rows[0].n, 1)
    const job = (await db.query<any>('select * from flow_progressao_claim()')).rows[0]
    await db.query(`insert into mensagens(id,lote_id,cobranca_id,carteira_id,contexto,status,regua_etapa_id)
      values($1,$2,$3,$4,'cobranca','pendente_aprovacao',$5)`, [id(201), job.lote_id, id(10), id(1), id(5)])
    await db.exec(`insert into acordos(unidade_id,status) values('${id(100)}','em_dia');`)
    assert.equal((await db.query<{ id: string | null }>('select flow_progressao_finalizar($1,$2,$3) id', [job.id, job.token, 'sender'])).rows[0].id, null)
    const cancelled = (await db.query<any>('select * from flow_progressao where id=$1', [job.id])).rows[0]
    assert.equal(cancelled.status, 'cancelado')
    assert.equal(cancelled.token, null)
    assert.equal((await db.query<any>('select status from mensagens where id=$1', [id(201)])).rows[0].status, 'cancelada')
    assert.equal((await db.query<any>('select status from lotes where id=$1', [job.lote_id])).rows[0].status, 'cancelado')
    assert.equal((await db.query<{ n: number }>('select flow_progressao_enfileirar() n')).rows[0].n, 0)
    assert.equal((await db.query('select * from flow_progressao_claim()')).rows.length, 0)
    await db.exec("update flow_progressao set status='atencao'")
    await db.query('select flow_progressao_enfileirar()')
    assert.equal((await db.query<any>('select status from flow_progressao')).rows[0].status, 'cancelado')
    await db.exec(`insert into mensagens(id,cobranca_id,contexto,status,payload) values
      ('${id(300)}','${id(12)}','cobranca','pendente_aprovacao','{"bloqueio_existente":true}'),
      ('${id(301)}','${id(12)}','cobranca','pendente_aprovacao','{"parcela_bloqueada":true}');`)
    assert.equal((await db.query('select * from mensagens m where id in($1,$2) and flow_cobranca_mensagem_elegivel(m)', [id(300), id(301)])).rows.length, 0)
    await db.exec('set role anon')
    await assert.rejects(db.query('select flow_cobranca_cancelar_acordos_vigentes()'), /permission denied/)
    await assert.rejects(db.query('select flow_cobrancas_tem_acordo_vigente(array[]::uuid[])'), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(db.query('select flow_cobranca_cancelar_acordos_vigentes()'), /permission denied/)
  } finally { await db.close() }
})
