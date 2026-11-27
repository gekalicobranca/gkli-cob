import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {getCobrancaStatusFinanceiro} from '../lib/core/cobranca-status'
import {cobrancaParticipaTotalizacao} from '../lib/core/cobranca-totalizacao'
import {resumirValoresCobrancas} from '../features/cobrancas/subtotais'
import {montarCatalogo} from '../features/cobrancas/catalogo'

test('Vinculado fica fora dos agregados sem zerar a dívida ou normalizar como aberto',()=>{
 const vinculado={id:'v',carteira_id:'c',condominio_id:'d',unidade_id:'u',vencimento:'2026-01-01',valor_original:900,valor_atualizado:1100,status_operacional:'judicializado',status_financeiro:'vinculado'}
 const ativo={...vinculado,id:'a',status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto',valor_original:100,valor_atualizado:123.45}
 const antes=structuredClone(vinculado)
 assert.equal(getCobrancaStatusFinanceiro(vinculado),'vinculado')
 assert.equal(cobrancaParticipaTotalizacao(vinculado),false)
 const resumo=resumirValoresCobrancas([vinculado,ativo])
 assert.equal(resumo.totalEmAberto,123.45)
 assert.equal(resumo.porCarteira[0].quantidade,1)
 assert.deepEqual(vinculado,antes)
 assert.equal(montarCatalogo([vinculado,ativo],'2026-11-27')[0].total,12345)
})

test('regra SQL preserva pagamentos, histórico e estado financeiro reversível',async()=>{
 const db=new PGlite()
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
 create table public.cobrancas(
 id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,
 status text,status_operacional text,status_financeiro text,
 valor_original numeric,valor_atualizado numeric,valor_pago numeric,data_pagamento date,
 observacoes text,automacao_bloqueada boolean default false,force_judicial boolean default false,
 arquivada_em timestamptz,duplicada_de_id uuid,
 constraint cobrancas_status_financeiro_check check(status_financeiro in('em_aberto','parcial','vencido','quitado','renegociado')));
 create table public.auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,usuario_id uuid,antes jsonb,depois jsonb,diferencas jsonb);
 create table public.timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,cobranca_id uuid,condominio_id uuid,unidade_id uuid,evento_tipo text,titulo text,descricao text,severidade text,origem text,usuario_id uuid,payload jsonb);
 create function public.forcar_contexto_judicial() returns trigger language plpgsql as $$ begin if new.force_judicial then new.status_operacional:='judicializado'; end if; return new; end $$;
 create trigger zz_judicial BEFORE INSERT OR UPDATE ON public.cobrancas FOR EACH ROW execute function public.forcar_contexto_judicial();
 insert into public.cobrancas(id,status,status_operacional,status_financeiro,valor_original,valor_atualizado,valor_pago,data_pagamento,observacoes,automacao_bloqueada)
 values
 ('00000000-0000-4000-8000-000000000001','judicializado','judicializado','em_aberto',100,125,null,null,'historico J',true),
 ('00000000-0000-4000-8000-000000000002','suspenso','suspenso','parcial',200,240,50,'2026-11-10','pagamento parcial',true),
 ('00000000-0000-4000-8000-000000000003','suspenso','suspenso','quitado',300,350,350,'2026-11-11','quitacao',true),
 ('00000000-0000-4000-8000-000000000004','judicializado','judicializado','renegociado',400,450,null,null,'acordo',true);`)
 const original=(await db.query<Record<string, unknown>>('select * from public.cobrancas order by id')).rows as any[]
 const migration=await readFile(new URL('../supabase/migrations/20261127212757_cobrancas_financeiro_vinculado.sql',import.meta.url),'utf8')
 await db.exec(migration)
 await db.exec("update public.cobrancas set status_financeiro=status_financeiro")
 const apos=(await db.query<Record<string, unknown>>('select * from public.cobrancas order by id')).rows as any[]
 for(let i=0;i<original.length;i++){
  const {status_financeiro,status_financeiro_antes_vinculo,...preservado}=apos[i]
  const {status_financeiro:financeiroOriginal,...antes}=original[i]
  assert.deepEqual(preservado,antes)
  assert.equal(status_financeiro,i<2?'vinculado':financeiroOriginal)
  assert.equal(status_financeiro_antes_vinculo,i<2?financeiroOriginal:null)
 }
 assert.equal((await db.query<Record<string, unknown>>('select count(*)::int n from public.auditoria_eventos')).rows[0].n,2)
 assert.equal((await db.query<Record<string, unknown>>('select count(*)::int n from public.timeline_operacional')).rows[0].n,2)
 // O refresh de origem não converte o parcial preservado em aberto.
 await db.exec("update public.cobrancas set status_financeiro='em_aberto' where id='00000000-0000-4000-8000-000000000002'")
 assert.equal((await db.query<Record<string, unknown>>("select status_financeiro_antes_vinculo x from public.cobrancas where id='00000000-0000-4000-8000-000000000002'")).rows[0].x,'parcial')
 // O retorno ao fluxo restaura o parcial e preserva o pagamento.
 await db.exec("update public.cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa' where id='00000000-0000-4000-8000-000000000002'")
 const retomada=(await db.query<Record<string, unknown>>("select * from public.cobrancas where id='00000000-0000-4000-8000-000000000002'")).rows[0] as any
 assert.equal(retomada.status_financeiro,'parcial');assert.equal(retomada.status_financeiro_antes_vinculo,null);assert.equal(Number(retomada.valor_pago),50)
 // A proteção operacional roda antes da classificação financeira, inclusive em inserts.
 await db.exec("insert into public.cobrancas(id,status,status_operacional,status_financeiro,valor_original,valor_atualizado,force_judicial) values('00000000-0000-4000-8000-000000000005','novo','novo','em_aberto',500,550,true)")
 const protegida=(await db.query<Record<string, unknown>>("select status_operacional,status_financeiro from public.cobrancas where id='00000000-0000-4000-8000-000000000005'")).rows[0]
 assert.equal(protegida.status_operacional,'judicializado');assert.equal(protegida.status_financeiro,'vinculado')
 assert.equal((await db.query<Record<string, unknown>>("select public.scanner_cobranca_aberta(jsonb_build_object('status_financeiro','vinculado')) aberto")).rows[0].aberto,false)
 // Uma quitação efetivamente registrada prevalece sobre Vinculado.
 await db.exec("update public.cobrancas set status_financeiro='quitado',valor_pago=125,data_pagamento='2026-11-27' where id='00000000-0000-4000-8000-000000000001'")
 const paga=(await db.query<Record<string, unknown>>("select status_financeiro,status_financeiro_antes_vinculo,valor_pago from public.cobrancas where id='00000000-0000-4000-8000-000000000001'")).rows[0]
 assert.equal(paga.status_financeiro,'quitado');assert.equal(paga.status_financeiro_antes_vinculo,null);assert.equal(Number(paga.valor_pago),125)
 await db.close()
})

