-- GKLI Cobrança — ADM1 Central Operacional de Administradoras
-- Execute depois dos SQLs de réguas/templates/U2.1.
-- Objetivo: administradora obrigatória no condomínio, solicitações rastreáveis,
-- régua ADM mensal de planilhas, bloqueio de formalização por planilha desatualizada
-- e preparação futura para Microsoft Graph.

create extension if not exists pgcrypto;

-- 1) Condomínios passam a ter vínculo forte com administradora.
alter table public.condominios
  add column if not exists administradora_id uuid references public.administradoras(id),
  add column if not exists planilha_debitos_competencia text,
  add column if not exists planilha_debitos_atualizada_em timestamptz;

create index if not exists condominios_administradora_id_idx
  on public.condominios(administradora_id);

-- Mantém compatibilidade com bases antigas que só tinham o texto administradora.
update public.condominios c
set administradora_id = a.id,
    administradora = coalesce(c.administradora, a.nome_operacional, a.nome)
from public.administradoras a
where c.administradora_id is null
  and c.administradora is not null
  and lower(trim(c.administradora)) in (lower(trim(a.nome)), lower(trim(coalesce(a.nome_operacional, a.nome))));

-- Se sua base ainda tiver condomínios sem administradora, cadastre/vincule antes de ativar NOT NULL.
do $$
begin
  if not exists (select 1 from public.condominios where administradora_id is null limit 1) then
    alter table public.condominios alter column administradora_id set not null;
  end if;
end $$;

-- 2) Contatos operacionais da administradora.
create table if not exists public.administradora_contatos (
  id uuid primary key default gen_random_uuid(),
  administradora_id uuid not null references public.administradoras(id) on delete cascade,
  nome text not null,
  cargo text,
  setor text,
  email text,
  telefone text,
  whatsapp text,
  principal boolean not null default false,
  recebe_cobranca boolean not null default false,
  recebe_boleto boolean not null default false,
  recebe_planilha boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists administradora_contatos_adm_idx
  on public.administradora_contatos(administradora_id, ativo);

-- 3) Lotes ADM para atualização mensal ou solicitações em massa.
create table if not exists public.lotes_administradora (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid references public.carteiras(id),
  tipo text not null default 'atualizacao_planilha_mensal',
  competencia text,
  status text not null default 'preparado',
  total_itens integer not null default 0,
  total_enviados integer not null default 0,
  total_respondidos integer not null default 0,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists lotes_administradora_status_idx
  on public.lotes_administradora(status, criado_em desc);

-- 4) Solicitações operacionais para administradoras.
create table if not exists public.solicitacoes_administradora (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid references public.lotes_administradora(id) on delete set null,
  carteira_id uuid references public.carteiras(id),
  administradora_id uuid not null references public.administradoras(id),
  contato_id uuid references public.administradora_contatos(id) on delete set null,
  condominio_id uuid references public.condominios(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  acordo_id uuid references public.acordos(id) on delete set null,
  tipo text not null,
  status text not null default 'preparado',
  prioridade text not null default 'normal',
  responsavel_interno text,
  canal text not null default 'email',
  codigo_rastreio text not null default ('GKLI-ADM-' || upper(substr(gen_random_uuid()::text,1,8))),
  assunto text,
  mensagem text,
  competencia_planilha text,
  prazo_resposta timestamptz,
  data_resposta timestamptz,
  ultima_interacao_em timestamptz,
  origem_retorno text not null default 'manual',
  status_retorno text,
  email_thread_id text,
  email_message_id text,
  provedor_email text,
  observacoes text,
  observacoes_retorno text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Colunas novas em bases que já tinham a tabela parcial.
alter table public.solicitacoes_administradora
  add column if not exists lote_id uuid references public.lotes_administradora(id) on delete set null,
  add column if not exists carteira_id uuid references public.carteiras(id),
  add column if not exists condominio_id uuid references public.condominios(id) on delete set null,
  add column if not exists unidade_id uuid references public.unidades(id) on delete set null,
  add column if not exists cobranca_id uuid references public.cobrancas(id) on delete set null,
  add column if not exists acordo_id uuid references public.acordos(id) on delete set null,
  add column if not exists codigo_rastreio text,
  add column if not exists competencia_planilha text,
  add column if not exists origem_retorno text default 'manual',
  add column if not exists status_retorno text,
  add column if not exists email_thread_id text,
  add column if not exists email_message_id text,
  add column if not exists provedor_email text,
  add column if not exists observacoes_retorno text,
  add column if not exists updated_at timestamptz default now();

update public.solicitacoes_administradora
set codigo_rastreio = 'GKLI-ADM-' || upper(substr(id::text,1,8))
where codigo_rastreio is null;

alter table public.solicitacoes_administradora
  alter column codigo_rastreio set default ('GKLI-ADM-' || upper(substr(gen_random_uuid()::text,1,8))),
  alter column codigo_rastreio set not null,
  alter column origem_retorno set default 'manual',
  alter column updated_at set default now();

create unique index if not exists solicitacoes_administradora_codigo_rastreio_key
  on public.solicitacoes_administradora(codigo_rastreio);

create index if not exists solicitacoes_adm_fila_idx
  on public.solicitacoes_administradora(status, prazo_resposta, created_at desc);

create index if not exists solicitacoes_adm_vinculos_idx
  on public.solicitacoes_administradora(administradora_id, condominio_id, unidade_id, acordo_id);

-- 5) Itens do lote ADM.
create table if not exists public.lote_administradora_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_administradora(id) on delete cascade,
  solicitacao_id uuid references public.solicitacoes_administradora(id) on delete set null,
  administradora_id uuid not null references public.administradoras(id),
  condominio_id uuid references public.condominios(id) on delete set null,
  total_cobrancas integer not null default 0,
  status text not null default 'preparado',
  criado_em timestamptz not null default now()
);

create index if not exists lote_adm_itens_lote_idx
  on public.lote_administradora_itens(lote_id, status);

-- 6) Logs/timeline ADM.
create table if not exists public.logs_operacionais_adm (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes_administradora(id) on delete cascade,
  status_anterior text,
  status_novo text,
  descricao text,
  origem_retorno text default 'manual',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists logs_operacionais_adm_solicitacao_idx
  on public.logs_operacionais_adm(solicitacao_id, created_at desc);

-- 7) Cobranças precisam guardar competência da planilha usada para acordo.
alter table public.cobrancas
  add column if not exists planilha_debitos_competencia text,
  add column if not exists planilha_debitos_atualizada_em timestamptz,
  add column if not exists planilha_debitos_solicitacao_id uuid references public.solicitacoes_administradora(id) on delete set null,
  add column if not exists bloqueio_formalizacao_motivo text;

create index if not exists cobrancas_planilha_competencia_idx
  on public.cobrancas(condominio_id, unidade_id, planilha_debitos_competencia);

-- 8) Acordos aguardando boletos.
alter table public.acordos
  add column if not exists boletos_emitidos_em timestamptz;

-- Se status for enum/text com constraint em sua base, ajuste a constraint antes se necessário.
-- Para bases text sem constraint, este status já passa a ser aceito pelo app.

-- 9) Templates ADM por carteira/global.
create table if not exists public.templates_mensageria_adm (
  id uuid primary key default gen_random_uuid(),
  carteira_id uuid references public.carteiras(id),
  nome text not null,
  tipo text not null,
  assunto text,
  conteudo text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.templates_mensageria_adm (nome, tipo, assunto, conteudo)
select 'ADM · Pedido de planilha de débitos', 'pedido_planilha_debitos', '[{{codigo_rastreio}}] Planilha de débitos — {{condominio}}',
'Prezados, solicitamos a planilha de débitos atualizada para {{condominio}}, unidade {{unidade}}, competência {{competencia_planilha}}.\n\nCódigo de rastreio: {{codigo_rastreio}}'
where not exists (select 1 from public.templates_mensageria_adm where tipo = 'pedido_planilha_debitos');

insert into public.templates_mensageria_adm (nome, tipo, assunto, conteudo)
select 'ADM · Emissão de boletos do acordo', 'pedido_emissao_boletos', '[{{codigo_rastreio}}] Emissão de boletos — {{condominio}}',
'Prezados, solicitamos a emissão dos boletos do acordo formalizado para {{condominio}}, unidade {{unidade}}.\n\nValor do acordo: {{valor_acordo}}\nCódigo de rastreio: {{codigo_rastreio}}'
where not exists (select 1 from public.templates_mensageria_adm where tipo = 'pedido_emissao_boletos');

insert into public.templates_mensageria_adm (nome, tipo, assunto, conteudo)
select 'ADM · Atualização mensal de planilha', 'atualizacao_planilha_mensal', '[{{codigo_rastreio}}] Atualização mensal de planilha — {{condominio}}',
'Prezados, identificamos cobranças captadas em mês anterior e solicitamos a planilha de débitos atualizada da competência {{competencia_planilha}} para {{condominio}}.\n\nCódigo de rastreio: {{codigo_rastreio}}'
where not exists (select 1 from public.templates_mensageria_adm where tipo = 'atualizacao_planilha_mensal');

-- 10) View de bloqueio operacional de formalização.
create or replace view public.v_cobrancas_bloqueio_planilha_adm as
select
  c.id as cobranca_id,
  c.carteira_id,
  c.condominio_id,
  c.unidade_id,
  c.created_at as captada_em,
  c.planilha_debitos_competencia,
  to_char(now(), 'YYYY-MM') as competencia_atual,
  (c.created_at::date < date_trunc('month', now())::date
    and coalesce(c.planilha_debitos_competencia, '') <> to_char(now(), 'YYYY-MM')) as bloqueada_para_formalizacao
from public.cobrancas c;

