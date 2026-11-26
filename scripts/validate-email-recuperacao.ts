import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { classificarFalhaSmtp } from '../features/mensageria/smtp-recuperacao'
import { envioExigeConferencia } from '../features/flows/cobranca/conferencia-envio'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table carteiras(id uuid primary key,email_transporte text default 'smtp',email_habilitado boolean default true);
    create table cobranca_flows(id uuid primary key,status text default 'em_execucao',iniciado_em timestamptz default now(),concluido_em timestamptz);
    create table acordo_flows(like cobranca_flows including all);
    create table mensagens(id uuid primary key,carteira_id uuid,canal text default 'email',status text default 'falha',status_operacional text default 'falha',
      cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,lote_id uuid,sent_at timestamptz,enviada_em timestamptz,
      agendada_para timestamptz,scheduled_at timestamptz,proxima_tentativa_em timestamptz,erro text,erro_envio text, elegivel boolean default true);
    create table lote_itens(id uuid primary key,mensagem_id uuid,status text default 'erro');
    create table email_tentativas(id uuid primary key,carteira_id uuid,mensagem_id uuid,estado text default 'falha',iniciado_em timestamptz default now()-interval '20 minutes',finalizado_em timestamptz default now());
    create table thunderbird_envios(id uuid,mensagem_id uuid,estado text);
    create table email_agenda(mensagem_id uuid primary key,agendada_para timestamptz);
    create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,antes jsonb,depois jsonb);
    create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select m.elegivel$$;
    create function acordo_parcela_mensagem_elegivel(m mensagens) returns boolean language sql as $$select m.elegivel$$;
    create function email_reservar_horario(p_mensagem uuid,p_remetente text,p_base timestamptz) returns timestamptz language plpgsql set search_path=public as $$
    begin
      if exists(select 1 from email_tentativas where mensagem_id=p_mensagem and estado in ('incerto','em_envio','enviado')) then raise exception 'Tentativa bloqueada'; end if;
      insert into email_agenda values(p_mensagem,p_base) on conflict(mensagem_id) do update set agendada_para=excluded.agendada_para;
      update mensagens set status='agendada',status_operacional='agendada',agendada_para=p_base,erro=null,erro_envio=null where id=p_mensagem;
      return p_base;
    end $$;
    insert into carteiras(id) values('${id(1)}');
    insert into cobranca_flows(id) values('${id(2)}');
    insert into mensagens(id,carteira_id,cobranca_flow_id) values('${id(3)}','${id(1)}','${id(2)}');
    insert into lote_itens(id,mensagem_id) values('${id(4)}','${id(3)}');
    insert into email_tentativas(id,mensagem_id) values('${id(5)}','${id(3)}');
  `)
  await db.exec(await readFile('supabase/migrations/20261126160000_email_recuperacao_segura.sql', 'utf8'))
  return db
}
async function recuperar(db: PGlite) {
  return (await db.query<{ r: { reagendadas: number; conferencia: number } }>('select email_recuperar_falhas_flows() r')).rows[0].r
}

test('classifica etapa de transmissão, recusa SMTP e configuração sem inferir segurança do texto', () => {
  assert.equal(classificarFalhaSmtp(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), false), 'repetir')
  assert.equal(classificarFalhaSmtp(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), true), 'conferencia')
  assert.equal(classificarFalhaSmtp({ smtpCode: 451 }, true), 'repetir')
  assert.equal(classificarFalhaSmtp({ smtpCode: 550 }, true), 'permanente')
  assert.equal(classificarFalhaSmtp(new Error('Configuração inválida'), false), 'permanente')
  assert.equal(classificarFalhaSmtp(new Error('read ECONNRESET'), false), 'permanente')
})

test('recupera a mesma mensagem uma só vez, preserva tentativa e reabre encerramento por falha', async () => {
  const db = await fixture()
  try {
    await db.exec("update email_tentativas set recuperacao='repetir',dados_transmitidos=false; update cobranca_flows set status='concluido_com_falhas'")
    assert.equal((await recuperar(db)).reagendadas, 1)
    assert.equal((await recuperar(db)).reagendadas, 0)
    assert.equal((await db.query('select * from mensagens')).rows.length, 1)
    assert.equal((await db.query('select * from email_tentativas')).rows.length, 1)
    assert.equal((await db.query<{ status: string }>('select status from cobranca_flows')).rows[0].status, 'em_execucao')
    assert.equal((await db.query<{ estado: string }>('select estado from email_tentativas')).rows[0].estado, 'falha')
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 1)
  } finally { await db.close() }
})

test('legado ambíguo e em_envio abandonado vão à conferência e não entram na agenda', async () => {
  const db = await fixture()
  try {
    await db.exec("update mensagens set erro_envio='read ECONNRESET'; update email_tentativas set estado='em_envio'")
    assert.equal((await recuperar(db)).conferencia, 1)
    assert.equal((await recuperar(db)).conferencia, 0)
    assert.equal((await db.query('select * from email_agenda')).rows.length, 0)
    assert.equal((await db.query<{ estado: string }>('select estado from email_tentativas')).rows[0].estado, 'em_envio')
    await assert.rejects(() => db.exec(`insert into email_agenda values('${id(3)}',now())`), /Envio sem confirmação/)
  } finally { await db.close() }
})

test('pausa, cancelamento, inelegibilidade, falha permanente e limite impedem repetição', async () => {
  const db = await fixture()
  try {
    await db.exec("update email_tentativas set recuperacao='repetir'")
    for (const status of ['pausado', 'cancelado', 'pronto']) {
      await db.query('update cobranca_flows set status=$1', [status])
      assert.equal((await recuperar(db)).reagendadas, 0)
    }
    await db.exec("update cobranca_flows set status='em_execucao'; update mensagens set elegivel=false")
    assert.equal((await recuperar(db)).reagendadas, 0)
    await db.exec("update mensagens set elegivel=true; update email_tentativas set recuperacao='permanente'")
    assert.equal((await recuperar(db)).reagendadas, 0)
    await db.exec(`update email_tentativas set recuperacao='repetir',recuperada_em=null;
      insert into email_tentativas(id,mensagem_id,iniciado_em) select gen_random_uuid(),'${id(3)}',now()-interval '1 day' from generate_series(1,3)`)
    assert.equal((await recuperar(db)).reagendadas, 0)
  } finally { await db.close() }
})

test('resultado incerto é registrado atomicamente e visível na conferência, inclusive legado falha', async () => {
  const db = await fixture()
  try {
    await db.exec("update email_tentativas set estado='em_envio'")
    await db.query('select email_registrar_falha_smtp($1,$2,$3,$4)', [id(5), 'conferencia', true, 'Conexão encerrada'])
    const t = (await db.query<{ estado: string; recuperacao: string }>('select * from email_tentativas')).rows[0]
    assert.equal(t.estado, 'incerto')
    assert.equal(envioExigeConferencia({ status: 'falha', email_tentativas: [t] }), true)
    assert.equal(envioExigeConferencia({ email_tentativas: [{ estado: 'falha', recuperacao: 'conferencia' }] }), true)
    assert.equal(envioExigeConferencia({ email_tentativas: [{ estado: 'em_envio', iniciado_em: '2026-11-12T23:00:00Z' }] }, Date.parse('2026-11-26T14:00:00Z')), true)
    assert.equal((await recuperar(db)).reagendadas, 0)
  } finally { await db.close() }
})

test('RPCs de recuperação não são executáveis por anon ou authenticated', async () => {
  const db = await fixture()
  try {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(() => db.exec('select public.email_recuperar_falhas_flows()'), /permission denied/)
      await db.exec('reset role')
    }
  } finally { await db.close() }
})

test('varredura inclui tentativas canceladas e sem mensagem sem recriar vínculos', async () => {
  const db = await fixture()
  try {
    await db.exec(`update mensagens set status='cancelada'; update email_tentativas set estado='em_envio';
      insert into email_tentativas(id,estado) values('${id(6)}','em_envio')`)
    const r = await recuperar(db)
    assert.equal(r.reagendadas, 0)
    const rows = (await db.query<{ recuperacao: string; estado: string }>('select recuperacao,estado from email_tentativas')).rows
    assert.equal(rows.length, 2)
    assert.ok(rows.every(t => t.recuperacao === 'conferencia' && t.estado === 'em_envio'))
    assert.equal((await db.query<{ status: string }>('select status from mensagens')).rows[0].status, 'cancelada')
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 2)
    assert.equal((await db.query('select * from email_agenda')).rows.length, 0)
  } finally { await db.close() }
})

