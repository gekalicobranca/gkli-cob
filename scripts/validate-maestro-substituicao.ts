import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { escolherContatoRegua } from '../features/regua/services/regua-shared'

test('e-mail inválido não impede outro e-mail válido nem o uso de celular', () => {
  const unidade = { email: 'invalido', telefone: '11987654321' }
  assert.equal(escolherContatoRegua({ unidade, canal: 'email' }).destinatario, null)
  assert.ok(escolherContatoRegua({ unidade, canal: 'whatsapp' }).destinatario)
  assert.equal(escolherContatoRegua({ unidade, canal: 'email', apoios: [{ email: 'contato@example.com' }] }).destinatario, 'contato@example.com')
})

async function conferirSubstituicao(origemJaMigrada: boolean) {
  const db = new PGlite()
  const migration = (name: string) => readFileSync('supabase/migrations/' + name + '.sql', 'utf8')
  const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table condominios(id uuid primary key,carteira_id uuid,status text);
      create table unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,bloco text,acao_judicial boolean);
      create table conversoes_relatorio(id uuid primary key,condominio_id uuid,carteira_id uuid,origem text,status text,
        criado_em timestamptz,atualizado_em timestamptz,preview_json jsonb,total_cobrancas int,limpeza_maestro_em timestamptz);
      create table cobrancas(id uuid primary key,unidade_id uuid,condominio_id uuid,carteira_id uuid,competencia text,
        observacoes text,duplicada_de_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada bool,
        valor_original numeric,valor_atualizado numeric,juros numeric,multa numeric,correcao numeric,
        created_at timestamptz default now(),updated_at timestamptz default now(),vencimento date,data_pagamento date,
        valor_pago numeric,conversao_relatorio_id uuid,arquivada_em timestamptz,origem_importacao text);
      create table cobranca_parcelas(cobranca_id uuid references cobrancas on delete cascade,conversao_relatorio_id uuid,
        data_vencimento date,referencia text,valor_original numeric,valor_atualizado numeric,status text,origem_linha_json jsonb);
      create table acordos(id uuid,cobranca_id uuid,status text);
      create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
      create table scanner_baixas(cobranca_id uuid references cobrancas);
      create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
      create table cobranca_flows(id uuid primary key,carteira_id uuid,status text,total_mensagens int,payload jsonb,
        total_pendentes int,total_agendadas int,total_falhas int,proximo_disparo_em timestamptz);
      create table carteiras(id uuid primary key);
      create table automacao_controle(chave text,ativo bool);
      create table lote_itens(id uuid primary key,unidade_id uuid,cobranca_id uuid references cobrancas on delete cascade,cobranca_flow_id uuid,status text);
      create table mensagens(id uuid primary key,cobranca_id uuid references cobrancas on delete cascade,carteira_id uuid,
        cobranca_flow_id uuid,canal text,status text,status_operacional text,destinatario text,email_destinatario text,whatsapp_numero text,
        payload jsonb,created_at timestamptz default now(),lote_item_id uuid references lote_itens on delete set null,
        cancelado_em timestamptz,cancelada_em timestamptz,agendada_para timestamptz,scheduled_at timestamptz,motivo_cancelamento text);
      create table email_agenda(mensagem_id uuid);
      create table email_tentativas(mensagem_id uuid,estado text);
      create table whatsapp_web_envios(mensagem_id uuid,estado text);
      create table flow_progressao(cobranca_ids uuid[],status text,token uuid,lease_ate timestamptz,erro text,updated_at timestamptz);
      create table maestro_flow_montagens(conversao_id uuid,condominio_id uuid,carteira_id uuid,status text,
        token uuid,lease_ate timestamptz,erro text,updated_at timestamptz,plano jsonb);
      create table central_pendencias(cobranca_id uuid,entidade_tipo text,entidade_id uuid,status text,resolvido_em timestamptz);
      create function email_ativar_flow(p_flow uuid,p_remetente text,p_usuario uuid) returns int language sql as 'select 1';
      create function flow_cobranca_mensagem_elegivel(m mensagens) returns bool language sql as 'select true';
      insert into carteiras values ('${id(2)}');
      insert into condominios values ('${id(1)}','${id(2)}','ativo');
      insert into unidades values ('${id(3)}','${id(1)}','${id(2)}','A',false);
      insert into conversoes_relatorio values ('${id(4)}','${id(1)}','${id(2)}','captacao_automatizada:teste','processando',
        '2026-11-10','2026-11-10','{"captacaoAutomatizada":true}',2,null);
      insert into cobrancas(id,unidade_id,condominio_id,carteira_id,observacoes,status,status_operacional,status_financeiro,
        automacao_bloqueada,valor_original,valor_atualizado,vencimento,updated_at)
      select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(3)}','${id(1)}','${id(2)}','Recibo '||n,
        st,st,'em_aberto',false,100,100,'2025-10-10','2026-11-01'
      from (values(10,'novo'),(11,'regular'),(12,'em_cobranca_ativa'),(13,'suspenso')) v(n,st);
      insert into mensagens(id,cobranca_id,carteira_id,canal,status) values
        ('${id(20)}','${id(10)}','${id(2)}','email','enviada'),
        ('${id(21)}','${id(12)}','${id(2)}','whatsapp','agendada');
    `)
    await db.exec(migration('20260923010000_cobrancas_recibo_guard'))
    await db.exec(migration('20261109230901_maestro_conciliar_cobrancas'))
    await db.exec(migration('20260917190000_maestro_ativacao_automatica').split('create or replace function public.maestro_flow_tick()')[0] + 'commit;')
    if (origemJaMigrada) await db.exec(`
      do $test$ begin
        execute replace(pg_get_functiondef('public.maestro_flow_ativar(uuid,text)'::regprocedure),
          $antigo$f.payload->>'origem' is distinct from 'maestro'$antigo$,
          $novo$coalesce(f.payload->>'origem','') not in ('maestro','easy_maestro')$novo$);
      end $test$;
    `)
    await db.exec(migration('20261110131531_substituir_cobrancas_maestro_preservar_historico'))
    const ids = [id(10), id(11), id(12)]
    const importadas = [10,13].map(n => ({ unidade_id: id(3), vencimento: '2025-10-10', recibo: String(n) }))
    const valores = [{ id: id(13), atualizado_em: '2026-11-01', valor_atualizado: 130, juros: 10, multa: 20, correcao: 0 }]
    const nova = { id: id(14), unidade_id: id(3), observacoes: 'Recibo 10', status_operacional: 'em_cobranca_ativa', valor_atualizado: 120 }
    const substituir = (novas: object[]) => db.query<{ r: Record<string, number> }>(
      'select maestro_substituir_captacao($1,$2,$3::uuid[],$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) r',
      [id(4),'2026-11-10','{' + ids.join(',') + '}',JSON.stringify(importadas),JSON.stringify(valores),JSON.stringify(novas),'[]'],
    )
    await assert.rejects(substituir([{ ...nova, id: id(13) }]), /duplicate key/)
    assert.equal((await db.query('select id from cobrancas')).rows.length, 4)
    const { rows } = await substituir([nova])
    assert.equal(rows[0].r.removidas, 3)
    assert.equal(rows[0].r.atualizadas, 1)
    assert.deepEqual((await db.query('select status,cobranca_id,unidade_id from mensagens order by id')).rows, [
      { status: 'enviada', cobranca_id: null, unidade_id: id(3) },
      { status: 'cancelada', cobranca_id: null, unidade_id: id(3) },
    ])
    assert.deepEqual((await db.query('select id,status_operacional from cobrancas order by id')).rows, [
      { id: id(13), status_operacional: 'suspenso' }, { id: id(14), status_operacional: 'em_cobranca_ativa' },
    ])
    await db.exec(`
      update maestro_flow_controle set ativo=true;
      insert into cobranca_flows(id,carteira_id,status,total_mensagens,payload)
        values ('${id(30)}','${id(2)}','pronto',1,'{"origem":"easy_maestro","condominio_id":"${id(1)}"}');
      insert into mensagens(id,carteira_id,cobranca_id,cobranca_flow_id,canal,status,destinatario)
        values ('${id(31)}','${id(2)}','${id(14)}','${id(30)}','whatsapp','pendente_aprovacao','5511987654321');
    `)
    assert.deepEqual((await db.query("select maestro_flow_ativar($1,'') status", [id(30)])).rows, [{ status: 'ativado' }])
  } finally { await db.close() }
}

test('captação preserva histórico e rollback com a origem do projeto local', () => conferirSubstituicao(false))
test('captação preserva histórico e rollback com a origem de produção', () => conferirSubstituicao(true))
