import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { dataCivilValida, validarDataCivil, vencimentoMensal, dataCivilSaoPaulo, diasEntreDatasCivis } from '../lib/core/data-civil'
import { normalizarCnj } from '../lib/core/cnj'
import { transicoesPreJuridico } from '../features/pre-juridico/etapas'
import { harness } from './audit-items-123-harness.cjs'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sqlFile = (name: string) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
let receipt = 100
async function user(n = 10) { await db.exec('reset role'); await db.query("select set_config('app.uid',$1,false)", [id(n)]); await db.exec('set role authenticated') }
async function admin(sql: string) { await db.exec('reset role'); return db.exec(sql) }
async function createAgreement(quantity: number, options: Record<string, unknown> = {}) {
  const c = ++receipt
  await admin(`insert into cobrancas(id,carteira_id,condominio_id,unidade_id,status,status_operacional) values('${id(c)}','${id(1)}','${id(3)}','${id(4)}','novo','novo')`)
  await user()
  const p = { carteira: id(1), cobranca: id(c), condominio: id(3), unidade: id(4), tipo: 'extrajudicial', processo: null,
    valor: 120, entrada: 0, percentual: 10, despesa: 10, data: '2026-01-31', status: 'ativo', fluxo: 'rascunho', exige: false,
    documento: null, observacoes: null,
    itens: JSON.stringify([{ cobranca_id: id(c), valor_original_no_acordo: 110, valor_atualizado_no_acordo: 110, encargos_no_acordo: 10, valor_total_no_acordo: 120 }]),
    parcelas: JSON.stringify(Array.from({ length: quantity }, (_, i) => ({ numero: i + 1, tipo_parcela: 'parcela', valor: 120 / quantity, vencimento: vencimentoMensal('2026-01-31', i) }))), cobranca_status: 'em_negociacao', ...options }
  const args = Object.values(p)
  const result = await db.query<{ id: string }>(`select criar_acordo_financeiro(${args.map((_,i)=>`$${i+1}`).join(',')}) id`, args)
  return result.rows[0].id
}
async function agreement(a: string) { return (await db.query<any>('select * from acordos where id=$1',[a])).rows[0] }
async function decide(a: string, decision: string) { return db.query('select decidir_aprovacao_sindico($1,$2,$3)',[a,decision,'Confirmação documental recebida do síndico.']) }
async function caseRow(c: string) { return (await db.query<any>('select * from pre_juridico_casos where id=$1',[c])).rows[0] }
async function change(c: string, dados: Record<string,unknown>, version?: number) {
  return db.query('select atualizar_caso_pre_juridico($1,$2,$3::jsonb)', [c,version ?? (await caseRow(c)).versao,JSON.stringify(dados)])
}
const cnj = (() => {
  const base='123456720268260002'; const dd=String(98-Number(BigInt(base+'00')%BigInt(97))).padStart(2,'0')
  return base.slice(0,7)+dd+base.slice(7)
})()
async function newCase() {
  const c=id(++receipt)
  await user(); await db.query('insert into pre_juridico_casos(id,carteira_id,condominio_id,unidade_id) values($1,$2,$3,$4)',[c,id(1),id(3),id(4)])
  return c
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function current_user_can_access_carteira(uuid) returns boolean language sql stable as $$ select $1='${id(1)}' and auth.uid()<>'${id(99)}' $$;
    create table profiles(id uuid primary key,role text); insert into profiles values('${id(10)}','operador'),('${id(11)}','gestor'),('${id(12)}','leitura'),('${id(99)}','gestor');
    create table condominios(id uuid primary key,carteira_id uuid,parcelas_acordo_sem_aprovacao_sindico int);
    insert into condominios values('${id(3)}','${id(1)}',3);
    create table unidades(id uuid primary key,carteira_id uuid,condominio_id uuid,credito_administradora numeric default 0,acao_judicial boolean default false);
    insert into unidades(id,carteira_id,condominio_id) values('${id(4)}','${id(1)}','${id(3)}');
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,duplicada_de_id uuid,status text,status_operacional text,status_financeiro text);
    create table acordos(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,condominio_id uuid,unidade_id uuid,tipo text,numero_processo text,
      valor_acordado numeric,entrada numeric,despesa_cobranca_percentual numeric,despesa_cobranca_valor numeric,data_acordo date,status text,status_financeiro text check (status_financeiro in ('em_aberto','parcial','quitado','vencido')),
      fluxo_status text,exige_aprovacao_sindico bool,sindico_aprovado_em timestamptz,documento_url text,observacoes text,credito_administradora_utilizado numeric default 0);
    create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid,valor_original_no_acordo numeric,valor_atualizado_no_acordo numeric,encargos_no_acordo numeric,valor_total_no_acordo numeric);
    create table parcelas_acordo(id uuid primary key default gen_random_uuid(),acordo_id uuid,numero int,tipo_parcela text,valor numeric,vencimento date,status text,data_pagamento date);
    create table acordos_termos(id uuid primary key default gen_random_uuid(),acordo_id uuid,tipo_aceite text,status text);
    create table mensagens(id uuid primary key default gen_random_uuid(),acordo_id uuid,payload jsonb,status text);
    create table central_pendencias(carteira_id uuid,condominio_id uuid,tipo text,status text,unidade_id uuid);
    create table pre_juridico_casos(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,cobranca_id uuid,
      etapa text not null default 'aguardando_documentos',responsavel_id uuid,observacoes text,escritorio_juridico text,numero_processo text,prazo_etapa date,
      protocolo_envio text,tribunal text,foro text,distribuicao_status text,distribuicao_solicitada_em timestamptz,distribuicao_cnj text,distribuido_em timestamptz,
      enviado_juridico_em timestamptz,judicializado_em timestamptz,certidao_status text default 'pendente',certidao_solicitada_em timestamptz,certidao_recebida_em timestamptz,
      procuracao_status text default 'pendente',procuracao_gerada_em timestamptz,procuracao_assinada_em timestamptz,procuracao_lote_id uuid,procuracao_lote_criado_em timestamptz,procuracao_flow_id uuid,
      juridico_procuracao_assinada_confirmada boolean not null default false,juridico_registro_recebido boolean not null default false,juridico_laudo_enviado boolean not null default false,updated_at timestamptz);
    alter table pre_juridico_casos enable row level security;
    create policy pre_scope on pre_juridico_casos for all to authenticated using(current_user_can_access_carteira(carteira_id)) with check(current_user_can_access_carteira(carteira_id));
    grant usage on schema public,auth to authenticated;
    grant select,insert,update on all tables in schema public to authenticated;
    insert into pre_juridico_casos(id,carteira_id,condominio_id,unidade_id,etapa) values('${id(900)}','${id(1)}','${id(3)}','${id(4)}','pronto_juridico');
  `)
  for (const name of ['20261006185625_remover_aprovacao_acordo_fora_regua.sql','20261026124600_bloquear_cobranca_em_outro_acordo.sql','20261026201008_acordo_multiplas_unidades_titular.sql','20261102174844_auditoria_aprovacao_sindico.sql','20261102174848_auditoria_pre_juridico_estados.sql']) await db.exec(await sqlFile(name))
  const sync = (await sqlFile('20261013151309_unidade_judicial_informativa_follow_60_dias.sql')).match(/create or replace function public\.sincronizar_judicializacao_pre_juridico\(\)[\s\S]*?\$\$;/)![0]
  await db.exec(sync)
  await db.exec('create trigger judicializar after update on pre_juridico_casos for each row execute function sincronizar_judicializacao_pre_juridico()')
})
after(async () => { await db.close() })

test('monthly dates preserve original day, leap years and reject impossible dates', () => {
  for (const [start,expected] of [['2026-01-28','2026-02-28'],['2026-01-29','2026-02-28'],['2026-01-30','2026-02-28'],['2026-01-31','2026-02-28'],['2024-01-31','2024-02-29'],['2026-03-31','2026-04-30'],['2026-08-31','2026-09-30']]) assert.equal(vencimentoMensal(start,1),expected)
  assert.equal(vencimentoMensal('2026-01-31',2),'2026-03-31')
  assert.equal(vencimentoMensal('2026-01-31',13),'2027-02-28')
  for (const invalid of ['2026-02-30','2026-04-31','2026-02-29','2026-13-01','0000-01-01','2026-1-01','2026-01-01T00:00:00Z']) { assert.equal(dataCivilValida(invalid),false); assert.throws(()=>validarDataCivil(invalid)) }
  assert.equal(dataCivilValida('2000-02-29'),true); assert.equal(dataCivilValida('1900-02-29'),false)
  assert.equal(diasEntreDatasCivis('2018-11-03','2018-11-04'),1)
})
test('dates stay civil under different host timezones and Sao Paulo day rollover', () => {
  const previous=process.env.TZ
  try { for (const tz of ['UTC','America/Sao_Paulo','Pacific/Auckland','America/Los_Angeles']) {
    process.env.TZ=tz
    assert.equal(vencimentoMensal('2026-01-31',1),'2026-02-28')
    assert.equal(dataCivilSaoPaulo(new Date('2026-11-03T02:59:59Z')),'2026-11-02')
    assert.equal(dataCivilSaoPaulo(new Date('2026-11-03T03:00:00Z')),'2026-11-03')
  } } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ=previous }
})
test('real simulator preview and Server Action generate the same dates and defer formalization', async () => {
  for(const quantidade of [2,3,4]) {
  const {state,load}=harness()
  state.pending=quantidade>3
  const input={quantidade_parcelas:String(quantidade),primeiro_vencimento:'2026-01-31',entrada:'0,00',despesa_cobranca_percentual:'10,00'}
  load('components/acordos/acordo-simulator-form.tsx').AcordoSimulatorForm({cobrancas:[state.cobranca],initialCobrancaId:'receipt',formularioInicial:input})
  const preview=state.memos.find((m:any)=>m?.parcelas&&m?.total)
  assert.ok(preview)
  const form=new FormData();Object.entries(input).forEach(([key,value])=>form.set(key,value));form.set('cobranca_id','receipt')
  await assert.rejects(load('features/acordos/actions.ts').createAcordo(form),/REDIRECT \/app\/acordos\/agreement/)
  assert.equal(state.financial.p_exige_aprovacao_sindico,quantidade>3)
  assert.equal(state.financial.p_valor_acordado,preview.total)
  assert.equal(JSON.stringify(preview.parcelas.map((p:any)=>p.vencimento)),JSON.stringify(state.financial.p_parcelas.map((p:any)=>p.vencimento)))
  assert.equal(state.writes.some((w:any)=>['acordos_termos','mensagens'].includes(w.table)),quantidade<=3)
  }
})
test('Server Action obeys database approval when configuration changes during creation', async () => {
  const {state,load}=harness(), form=new FormData()
  Object.entries({cobranca_id:'receipt',primeiro_vencimento:'2026-01-31',entrada:'0,00',quantidade_parcelas:'3',despesa_cobranca_percentual:'10,00'}).forEach(([k,v])=>form.set(k,v))
  state.pending=true
  await assert.rejects(load('features/acordos/actions.ts').createAcordo(form),/REDIRECT/)
  assert.equal(state.writes.some((w:any)=>['acordos_termos','mensagens'].includes(w.table)),false)
})
test('direct Server Action rejects invalid first and entry dates before any write', async () => {
  for(const [first,entry] of [['2026-02-30',''],['2026-01-31','2026-04-31']]) {
    const {state,load}=harness(),form=new FormData()
    Object.entries({cobranca_id:'receipt',primeiro_vencimento:first,entrada:entry?'10,00':'0,00',entrada_vencimento:entry,quantidade_parcelas:'4',despesa_cobranca_percentual:'10,00'}).forEach(([k,v])=>form.set(k,v))
    await assert.rejects(load('features/acordos/actions.ts').createAcordo(form),/inválido/)
    assert.equal(state.financial,null);assert.equal(state.writes.length,0)
  }
})
test('approval threshold: below, exactly at, above; RPC ignores browser privilege flags', async () => {
  for (const qty of [2,3,4]) {
    const a=await createAgreement(qty,{exige:false,fluxo:'boletos_enviados'})
    assert.equal((await agreement(a)).exige_aprovacao_sindico,qty>3)
    if(qty>3) assert.equal((await agreement(a)).fluxo_status,'aguardando_aprovacao_sindico')
    const dates=(await db.query<any>('select vencimento::text data from parcelas_acordo where acordo_id=$1 order by numero',[a])).rows.map(p=>p.data)
    assert.deepEqual(dates,Array.from({length:qty},(_,i)=>vencimentoMensal('2026-01-31',i)))
  }
})
test('unapproved agreement blocks documents, requests and direct flag bypass', async () => {
  const a=await createAgreement(4)
  await assert.rejects(db.query("insert into acordos_termos(acordo_id,tipo_aceite) values($1,'devedor')",[a]),/bloqueados/)
  await assert.rejects(db.query("insert into mensagens(acordo_id,payload) values($1,'{}')",[a]),/bloqueados/)
  await assert.rejects(db.query("update acordos set fluxo_status='boletos_solicitados' where id=$1",[a]),/Aguarde/)
  await assert.rejects(db.query('update acordos set exige_aprovacao_sindico=false where id=$1',[a]),/removida/)
  await assert.rejects(decide(a,'aprovar'),/Somente/)
  await assert.rejects(db.query('update acordos set sindico_aprovado_em=now() where id=$1',[a]),/Somente/)
  const empty=id(++receipt)
  await db.query("insert into acordos(id,carteira_id,condominio_id,unidade_id,status,fluxo_status,exige_aprovacao_sindico) values($1,$2,$3,$4,'ativo','rascunho',false)",[empty,id(1),id(3),id(4)])
  await assert.rejects(db.query("insert into mensagens(acordo_id,payload) values($1,'{}')",[empty]),/Plano de pagamento/)
})
test('financial RPC rejects non-civil and impossible dates without leaving agreements', async () => {
  for (const date of ['2026-02-30','2026-1-31','January 31 2026']) {
    const before=Number((await db.query<any>('select count(*) n from acordos')).rows[0].n)
    await assert.rejects(createAgreement(1,{parcelas:JSON.stringify([{numero:1,tipo_parcela:'parcela',valor:120,vencimento:date}])}),/date|Vencimento|range/i)
    assert.equal(Number((await db.query<any>('select count(*) n from acordos')).rows[0].n),before)
  }
  await assert.rejects(createAgreement(4,{parcelas:JSON.stringify(Array.from({length:4},(_,i)=>({numero:i,tipo_parcela:'entrada',valor:30,vencimento:'2026-01-31'})))}),/Plano inválido/)
})
test('one authorized approval; second and opposing decisions are rejected', async () => {
  const a=await createAgreement(4); await user(11)
  await decide(a,'aprovar')
  assert.ok((await agreement(a)).sindico_aprovado_em)
  await db.query("insert into acordos_termos(acordo_id,tipo_aceite) values($1,'devedor')",[a])
  await assert.rejects(decide(a,'aprovar'),/não está aguardando/)
  await assert.rejects(decide(a,'rejeitar'),/não está aguardando/)
  assert.equal((await db.query<any>('select count(*)::int n from acordos_sindico_decisoes where acordo_id=$1',[a])).rows[0].n,1)
  await assert.rejects(db.query("insert into parcelas_acordo(acordo_id,numero,tipo_parcela,valor,vencimento) values($1,5,'parcela',10,'2026-05-31')",[a]),/nova proposta/)
})
test('direct extra installments enforce approval; zero limit and entry keep existing policy', async () => {
  const a=await createAgreement(3)
  await db.query("insert into parcelas_acordo(acordo_id,numero,tipo_parcela,valor,vencimento) values($1,0,'entrada',10,'2026-01-30')",[a])
  assert.equal((await agreement(a)).exige_aprovacao_sindico,false)
  await db.query("insert into parcelas_acordo(acordo_id,numero,tipo_parcela,valor,vencimento) values($1,4,'parcela',10,'2026-04-30')",[a])
  assert.equal((await agreement(a)).exige_aprovacao_sindico,true)
  await admin(`update condominios set parcelas_acordo_sem_aprovacao_sindico=0 where id='${id(3)}'`)
  const unrestricted=await createAgreement(5)
  assert.equal((await agreement(unrestricted)).exige_aprovacao_sindico,false)
  await admin(`update condominios set parcelas_acordo_sem_aprovacao_sindico=3 where id='${id(3)}'`)
})
test('rejection cancels unpaid installments atomically and preserves recorded payments', async () => {
  const a=await createAgreement(4); await user(11); await decide(a,'rejeitar')
  assert.equal((await agreement(a)).status,'cancelado')
  assert.ok((await db.query<any>('select status from parcelas_acordo where acordo_id=$1',[a])).rows.every(p=>p.status==='cancelada'))
  await assert.rejects(decide(a,'aprovar'),/não está aguardando/)
  const paid=await createAgreement(4)
  await db.query("update parcelas_acordo set status='paga',data_pagamento='2026-10-01' where acordo_id=$1 and numero=1",[paid])
  await user(11); await assert.rejects(decide(paid,'rejeitar'),/pagamento.*preservados/)
  assert.equal((await db.query<any>('select data_pagamento::text data from parcelas_acordo where acordo_id=$1 and numero=1',[paid])).rows[0].data,'2026-10-01')
})
test('rejection returns the actual reserved credit only once', async () => {
  const a=await createAgreement(4)
  await admin(`update unidades set credito_administradora=75 where id='${id(4)}'; update acordos set credito_administradora_utilizado=25 where id='${a}'`)
  await user(11); await decide(a,'rejeitar')
  assert.ok((await agreement(a)).credito_administradora_restituido_em)
  assert.equal(Number((await db.query<any>('select credito_administradora from unidades where id=$1',[id(4)])).rows[0].credito_administradora),100)
  await assert.rejects(decide(a,'rejeitar'),/não está aguardando/)
  assert.equal(Number((await db.query<any>('select credito_administradora from unidades where id=$1',[id(4)])).rows[0].credito_administradora),100)
})
test('queued competing approval decisions produce one winner', async () => {
  const a=await createAgreement(4); await user(11)
  const result=await Promise.allSettled([decide(a,'aprovar'),decide(a,'rejeitar')])
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1)
})
test('CNJ validates check digits in TypeScript and SQL', async () => {
  assert.equal(normalizarCnj(cnj),cnj)
  for(const bad of ['',cnj.slice(1),cnj+'1','0'.repeat(20),'letters'+cnj]) assert.throws(()=>normalizarCnj(bad))
  assert.equal((await db.query<any>('select cnj_valido($1) valid',[cnj])).rows[0].valid,true)
  assert.equal((await db.query<any>("select cnj_valido('00000000000000000000') valid")).rows[0].valid,false)
})
test('pre-juridico rejects every stage jump and incomplete document transition', async () => {
  const c=await newCase()
  for (const etapa of ['confirmar_juridico','enviado_juridico','analise_juridica','pronto_juridico','autorizado_ajuizamento','judicializado']) await assert.rejects(change(c,{etapa}),/Transição/)
  await assert.rejects(change(c,{etapa:'aguardando_sindico'}),/certidão/)
  assert.deepEqual(transicoesPreJuridico('judicializado'),[])
  await assert.rejects(db.query("insert into pre_juridico_casos(carteira_id,etapa) values($1,'pronto_juridico')",[id(1)]),/começar/)
})
test('full legal pipeline protects review, CNJ, distribution and linked debts', async () => {
  const c=await newCase()
  await change(c,{etapa:'aguardando_sindico',certidao_status:'recebida',certidao_recebida_em:'2026-11-02T12:00:00Z'})
  await assert.rejects(change(c,{etapa:'confirmar_juridico'}),/procuração/)
  await change(c,{etapa:'confirmar_juridico',procuracao_status:'assinada',procuracao_assinada_em:'2026-11-02T12:00:00Z'})
  await assert.rejects(change(c,{etapa:'enviado_juridico'}),/procuração, registro e laudo/)
  await change(c,{etapa:'enviado_juridico',juridico_procuracao_assinada_confirmada:true,juridico_registro_recebido:true,juridico_laudo_enviado:true})
  await assert.rejects(change(c,{etapa:'analise_juridica'}),/administrador ou gestor/)
  await user(11); await change(c,{etapa:'analise_juridica'})
  await assert.rejects(change(c,{etapa:'autorizado_ajuizamento'}),/evidência/)
  await change(c,{etapa:'pendencia_juridica',observacoes:'Pendência documental conferida.'}); await change(c,{etapa:'analise_juridica'})
  await change(c,{etapa:'autorizado_ajuizamento',observacoes:'Documentação revisada; ajuizamento autorizado.'})
  await change(c,{etapa:'pronto_juridico'})
  await assert.rejects(change(c,{etapa:'judicializado'}),/CNJ/)
  await admin(`insert into cobrancas(id,unidade_id,status,status_operacional,status_financeiro) values
    ('${id(801)}','${id(4)}','pre_juridico','pre_juridico','em_aberto'),
    ('${id(802)}','${id(4)}','novo','novo','em_aberto'),
    ('${id(803)}','${id(4)}','pre_juridico','pre_juridico','pago')`)
  await user(11); await change(c,{etapa:'judicializado',distribuicao_status:'distribuido',distribuicao_cnj:cnj})
  assert.equal((await caseRow(c)).etapa,'judicializado')
  assert.equal((await db.query<any>('select acao_judicial from unidades where id=$1',[id(4)])).rows[0].acao_judicial,true)
  const rows=(await db.query<any>('select status_operacional from cobrancas where id in ($1,$2,$3) order by id',[id(801),id(802),id(803)])).rows
  assert.deepEqual(rows.map(r=>r.status_operacional),['judicializado','novo','pre_juridico'])
  await assert.rejects(change(c,{etapa:'analise_juridica'}),/judicializado/)
})
test('stale updates and batches fail atomically', async () => {
  const a=await newCase(),b=await newCase(); const v=(await caseRow(a)).versao
  await change(a,{observacoes:'Primeiro operador.'},v)
  await assert.rejects(change(a,{observacoes:'Segundo operador.'},v),/outro operador/)
  const before=(await caseRow(b)).versao, antesA=(await caseRow(a)).versao
  await assert.rejects(db.query('select atualizar_casos_pre_juridico($1::jsonb)',[JSON.stringify([
    {id:a,versao:antesA,dados:{observacoes:'Alteração a reverter'}},{id:b,versao:-1,dados:{observacoes:'Versão antiga'}}
  ])]),/outro operador/)
  assert.equal((await caseRow(b)).versao,before)
  assert.equal((await caseRow(a)).versao,antesA)
  assert.equal((await caseRow(a)).observacoes,'Primeiro operador.')
  await assert.rejects(change(a,{juridico_revisado_em:'2026-11-02T12:00:00Z'}),/Campos/)
  await user(12); await assert.rejects(change(a,{observacoes:'Leitura'}),/Sem permissão/)
  await user(99); await assert.rejects(change(a,{observacoes:'Carteira alheia'},0),/sem acesso/)
})
test('legacy cases cannot distribute without review and may reopen documentation by manager', async () => {
  await user(11)
  await assert.rejects(change(id(900),{etapa:'judicializado',distribuicao_status:'distribuido',distribuicao_cnj:cnj}),/certidão|procuração|Revisão/)
  await user(10); await assert.rejects(change(id(900),{etapa:'aguardando_documentos'}),/administrador ou gestor/)
  await user(11); await change(id(900),{etapa:'aguardando_documentos',observacoes:'Retorno para conferir os documentos do caso legado.'})
  assert.equal((await caseRow(id(900))).etapa,'aguardando_documentos')
  assert.equal((await caseRow(id(900))).ajuizamento_autorizado_em,null)
})
