-- GKLI Cobrança — limpeza pré-teste ponta a ponta
-- Objetivo: zerar dados operacionais sem remover acesso/login.
-- Preserva: auth.users, public.profiles, public.carteiras e public.usuarios_carteiras.
-- Motivo: o app usa carteira para escopo; sem carteira/vínculo, o teste ponta a ponta pode travar logo no login/filtros.

begin;

-- 1) Trunca tabelas operacionais existentes, em ordem defensiva.
do $$
declare
  t text;
begin
  foreach t in array array[
    -- Execuções, agentes e arquivos
    'agente_validacoes',
    'agente_arquivos',
    'agente_logs',
    'agente_execucoes',
    'agente_credenciais',
    'agente_receitas',
    'agente_administradoras',

    -- Portal do síndico / acessos externos
    'portal_sindico_auditoria',
    'portal_sindico_sessoes',
    'portal_sindico_convites',
    'portal_sindico_condominios',
    'portal_sindico_usuarios',

    -- Inteligência, automações, jobs e auditoria operacional
    'ai_interacoes',
    'automacoes_execucoes',
    'automacoes',
    'jobs_operacionais',
    'audit_logs',
    'auditoria_operacional',
    'auditoria_eventos',
    'eventos_operacionais',

    -- Timeline e pendências
    'timeline_operacional',
    'central_pendencias',

    -- Administradoras e operação externa
    'logs_operacionais_adm',
    'solicitacoes_administradora',
    'templates_mensageria_adm',
    'administradora_contatos',
    'administradoras',

    -- Mensageria / régua / lotes
    'mensageria_eventos',
    'mensageria_logs',
    'lote_itens',
    'mensagens',
    'lotes',
    'lotes_mensagens',
    'regua_etapas',
    'reguas',
    'mensagens_templates',

    -- Acordos
    'acordos_timeline',
    'acordos_parcelas',
    'parcelas_acordo',
    'acordos',

    -- Cobranças / relatórios / importações
    'cobranca_parcelas',
    'interacoes',
    'cobrancas',
    'conversoes_relatorio',
    'importacao_itens',
    'importacoes',

    -- Base operacional
    'unidades',
    'condominios',

    -- Estado/processo
    'transicoes_estado'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('truncate table public.%I restart identity cascade', t);
    end if;
  end loop;
end $$;

-- 2) Reforça timestamps de usuários/carteiras preservados, se as tabelas existirem.
do $$
begin
  if to_regclass('public.profiles') is not null then
    update public.profiles
    set updated_at = now()
    where updated_at is null;
  end if;

  if to_regclass('public.carteiras') is not null then
    update public.carteiras
    set updated_at = now()
    where updated_at is null;
  end if;
end $$;

-- 3) Opcional: se você realmente quiser deixar SOMENTE usuários, execute manualmente depois.
-- Atenção: isso remove escopo/carteiras e pode exigir recriação antes do teste ponta a ponta.
-- truncate table public.usuarios_carteiras restart identity cascade;
-- truncate table public.carteiras restart identity cascade;

commit;

-- Conferência rápida pós-limpeza.
-- Deve retornar contagem zerada nas tabelas operacionais existentes.
select 'profiles' as tabela, count(*) as registros from public.profiles
union all
select 'carteiras', count(*) from public.carteiras
union all
select 'usuarios_carteiras', count(*) from public.usuarios_carteiras
union all
select 'condominios', count(*) from public.condominios
union all
select 'unidades', count(*) from public.unidades
union all
select 'cobrancas', count(*) from public.cobrancas
union all
select 'acordos', count(*) from public.acordos
union all
select 'mensagens', count(*) from public.mensagens
union all
select 'administradoras', count(*) from public.administradoras
union all
select 'timeline_operacional', count(*) from public.timeline_operacional
union all
select 'central_pendencias', count(*) from public.central_pendencias;
