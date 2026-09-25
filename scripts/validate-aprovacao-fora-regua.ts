import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { propostaFinanceiraParaAprovacao, guardarFormularioProposta } from '../features/acordos/aprovacao-fora-regua';

async function main() {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function public.current_user_can_access_carteira(uuid) returns boolean language sql as $$ select $1='${id(1)}'::uuid $$;
    create table profiles(id uuid primary key,role text);
    insert into profiles values ('${id(10)}','operador'),('${id(11)}','gestor'),('${id(12)}','leitura');
    create table carteiras(id uuid primary key);
    insert into carteiras values ('${id(1)}'),('${id(2)}');
    create table condominios(id uuid primary key,carteira_id uuid,nome text,inicio_cobranca_dias int);
    insert into condominios values ('${id(3)}','${id(1)}','Condomínio de teste',61);
    create table unidades(id uuid primary key,condominio_id uuid,identificacao text,bloco text);
    insert into unidades values ('${id(4)}','${id(3)}','111','A1');
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,duplicada_de_id uuid,
      vencimento date,valor_original numeric,valor_atualizado numeric,status text,status_operacional text);
    insert into cobrancas values
      ('${id(5)}','${id(1)}','${id(3)}','${id(4)}',null,(now() at time zone 'America/Sao_Paulo')::date-45,100,100,'novo','novo'),
      ('${id(6)}','${id(1)}','${id(3)}','${id(4)}',null,(now() at time zone 'America/Sao_Paulo')::date-14,100,100,'novo','novo'),
      ('${id(7)}','${id(1)}','${id(3)}','${id(4)}',null,(now() at time zone 'America/Sao_Paulo')::date-61,100,100,'novo','novo');
    create table acordos(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,condominio_id uuid,
      unidade_id uuid,tipo text,numero_processo text,valor_acordado numeric,entrada numeric,despesa_cobranca_percentual numeric,
      despesa_cobranca_valor numeric,data_acordo date,status text,fluxo_status text,exige_aprovacao_sindico bool,documento_url text,observacoes text);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid,valor_original_no_acordo numeric,valor_atualizado_no_acordo numeric,
      encargos_no_acordo numeric,valor_total_no_acordo numeric);
    create table parcelas_acordo(acordo_id uuid,numero int,tipo_parcela text,valor numeric,vencimento date,status text);
    create table central_pendencias(id uuid primary key default gen_random_uuid(),carteira_id uuid,origem text,tipo text,status text,
      prioridade text,titulo text,descricao text,entidade_tipo text,entidade_id uuid,condominio_id uuid,unidade_id uuid,cobranca_id uuid,
      acordo_id uuid,payload jsonb,resolvido_em timestamptz,updated_at timestamptz);
    grant usage on schema auth,public to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260924210000_aprovacao_acordo_fora_regua.sql', import.meta.url), 'utf8'));
  const asUser = async (user: number) => {
    await db.query("select set_config('app.uid',$1,false)", [id(user)]);
    await db.exec('set role authenticated');
  };
  const params = (ids = [5, 6]) => ({
    p_carteira_id: id(1), p_cobranca_id: id(ids[0]), p_condominio_id: id(3), p_unidade_id: id(4),
    p_tipo: 'extrajudicial', p_numero_processo: null, p_valor_acordado: ids.length * 110, p_entrada: 0,
    p_despesa_cobranca_percentual: 10, p_despesa_cobranca_valor: ids.length * 10, p_data_acordo: '2026-09-24',
    p_status: 'ativo', p_fluxo_status: 'boletos_solicitados', p_exige_aprovacao_sindico: false,
    p_documento_url: null, p_observacoes: null,
    p_itens: ids.map((n) => ({ cobranca_id: id(n), valor_original_no_acordo: 100, valor_atualizado_no_acordo: 100, encargos_no_acordo: 10, valor_total_no_acordo: 110 })),
    p_parcelas: [{ numero: 1, tipo_parcela: 'parcela', valor: ids.length * 110, vencimento: '2026-10-01', status: 'pendente' }],
    p_cobranca_status: 'em_negociacao',
  });
  const request = async (p = params()) => {
    const result = await db.query<{ result: any }>('select solicitar_aprovacao_acordo_fora_regua($1,$2,$3,$4,$5::jsonb,$6::jsonb) result',
      [p.p_carteira_id, p.p_condominio_id, p.p_unidade_id, p.p_cobranca_id, JSON.stringify(propostaFinanceiraParaAprovacao(p)), JSON.stringify({ quantidade_parcelas: '1' })]);
    return result.rows[0].result;
  };
  const create = async (p = params()) => {
    const values = Object.values(p).map((v) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    return db.query('select criar_acordo_financeiro(' + values.map((_, i) => `$${i + 1}`).join(',') + ') id', values);
  };
  const decide = async (approvalId: string, decision: string) => db.query('select decidir_aprovacao_acordo_fora_regua($1,$2,$3)', [approvalId, decision, 'Conferido com a administradora.']);

  await asUser(10);
  await assert.rejects(create(), /exige aprovação do gestor/);
  const approval = await request();
  assert.equal(approval.status, 'pendente');
  assert.equal((await request()).id, approval.id, 'Repeated submits must reuse the same pending proposal');
  assert.equal((await request(params([6, 5]))).id, approval.id, 'Receipt ordering must not create a new approval');
  await assert.rejects(decide(approval.id, 'aprovada'), /Somente gestor/);
  await assert.rejects(db.query("update acordos_aprovacoes_fora_regua set status='aprovada'"), /permission denied/);
  await assert.rejects(request({ ...params(), p_carteira_id: id(2) }), /Sem permissão/);
  await db.exec('reset role');
  assert.equal((await db.query<{ count: number }>('select count(*)::int count from acordos')).rows[0].count, 0);
  assert.equal((await db.query<{ count: number }>('select count(*)::int count from parcelas_acordo')).rows[0].count, 0);
  const saved = (await db.query<any>('select * from acordos_aprovacoes_fora_regua')).rows[0];
  assert.equal(saved.recibos_fora_regua.length, 2);
  assert.equal(saved.solicitado_por, id(10));
  await db.exec("update central_pendencias set status='resolvida'");
  await asUser(10);
  await assert.rejects(create(), /exige aprovação/, 'Resolving a generic pending item must not grant approval');
  await asUser(11);
  await decide(approval.id, 'aprovada');
  await asUser(10);
  await assert.rejects(create({ ...params(), p_valor_acordado: 221 }), /exige aprovação/);
  await assert.rejects(create({ ...params(), p_parcelas: [{ ...params().p_parcelas[0], vencimento: '2026-11-01' }] }), /exige aprovação/);
  // An error after the approval check must roll back both the agreement and approval consumption.
  await db.exec('reset role');
  await db.exec("alter table parcelas_acordo add constraint test_failure check (valor<200)");
  await asUser(10);
  await assert.rejects(create(), /test_failure/);
  await db.exec('reset role');
  assert.equal((await db.query<any>('select acordo_id from acordos_aprovacoes_fora_regua')).rows[0].acordo_id, null);
  await db.exec('alter table parcelas_acordo drop constraint test_failure');
  await asUser(10);
  const agreement = (await create()).rows[0] as { id: string };
  assert.ok(agreement.id);
  await assert.rejects(create(), /exige aprovação/, 'Approval can only create one agreement');
  assert.equal(await request(params([7])), null, 'At D+61 approval is not required');
  assert.ok((await create(params([7]))).rows.length);

  const changed = { ...params(), p_valor_acordado: 230 };
  const rejected = await request(changed);
  await asUser(11);
  await decide(rejected.id, 'rejeitada');
  await asUser(10);
  await assert.rejects(create(changed), /exige aprovação/);
  await asUser(12);
  await assert.rejects(request(), /Sem permissão/);
  await assert.rejects(create(params([7])), /Sem permissão/);
  await db.exec('reset role');
  const audit = (await db.query<any>('select * from acordos_aprovacoes_fora_regua where id=$1', [approval.id])).rows[0];
  assert.equal(audit.decidido_por, id(11));
  assert.ok(audit.decidido_em);
  assert.equal(audit.acordo_id, agreement.id);

  const form = new FormData();
  form.set('entrada', '25,00'); form.append('cotas_sem_despesas', id(5)); form.set('token', 'must-not-be-saved');
  const stored = guardarFormularioProposta(form);
  assert.equal(stored.entrada, '25,00'); assert.equal(stored.cotas_sem_despesas, id(5)); assert.equal(stored.token, undefined);
  await db.close();
  console.log('OK: approval required without exemption; deduplication; scope; roles; audit; generic resolution bypass; changed terms; atomic rollback; single use; rejection; D+ boundary; saved form.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
