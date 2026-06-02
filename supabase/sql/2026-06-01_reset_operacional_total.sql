-- Reset operacional total da base de testes.
--
-- PRESERVA:
-- - public.carteiras
-- - public.condominios
-- - public.administradoras
-- - public.administradora_contatos
-- - usuarios/perfis/configuracoes
--
-- REMOVE:
-- - unidades
-- - responsaveis_unidades
-- - cobrancas
-- - acordos
-- - parcelas de acordo
-- - interacoes, mensagens, timeline e eventos vinculados
-- - pausas/scores de regua vinculados a unidade/cobranca/acordo
-- - importacoes e lotes operacionais/de administradora
--
-- Rode apenas quando quiser zerar a operacao para uma nova carga.

begin;

create temp table tmp_reset_unidades as
select id from public.unidades;

create temp table tmp_reset_cobrancas as
select id from public.cobrancas;

create temp table tmp_reset_acordos as
select id from public.acordos;

-- Importacoes e lotes de teste.
delete from public.importacao_itens;
delete from public.importacoes;

delete from public.lote_itens;

delete from public.lote_administradora_itens;
delete from public.solicitacoes_administradora;
delete from public.lotes_administradora;

-- Mensageria, regua e inteligencia operacional.
delete from public.mensagens;

delete from public.lotes;

delete from public.regua_pausas;

delete from public.regua_inteligencia_scores;

-- Historicos e auditorias operacionais.
delete from public.interacoes;

delete from public.timeline_operacional;

delete from public.eventos_operacionais;

delete from public.auditoria_eventos;

-- Acordos e cobrancas.
delete from public.acordo_cobrancas
where cobranca_id in (select id from tmp_reset_cobrancas)
   or acordo_id in (select id from tmp_reset_acordos);

delete from public.parcelas_acordo
where acordo_id in (select id from tmp_reset_acordos);

delete from public.acordos
where id in (select id from tmp_reset_acordos);

delete from public.cobrancas
where id in (select id from tmp_reset_cobrancas);

-- Base operacional e apoio de responsaveis.
delete from public.responsaveis_unidades;

delete from public.unidades
where id in (select id from tmp_reset_unidades);

select
  (select count(*) from tmp_reset_unidades) as unidades_removidas,
  (select count(*) from tmp_reset_cobrancas) as cobrancas_removidas,
  (select count(*) from tmp_reset_acordos) as acordos_removidos,
  (select count(*) from public.condominios) as condominios_preservados,
  (select count(*) from public.administradoras) as administradoras_preservadas;

commit;
