-- Prevent duplicated side effects when agreement formalization is retried.

create unique index if not exists acordos_termos_ativos_tipo_unique_idx
  on public.acordos_termos(acordo_id, tipo_aceite)
  where status in ('pendente', 'visualizado', 'aceito');

create unique index if not exists central_pendencias_emissao_boletos_acordo_aberta_unique_idx
  on public.central_pendencias(acordo_id)
  where acordo_id is not null
    and tipo = 'emissao_boletos_acordo'
    and status not in ('resolvida', 'cancelada');

create unique index if not exists mensagens_boletos_administradora_acordo_unique_idx
  on public.mensagens(acordo_id)
  where acordo_id is not null
    and origem_evento = 'acordo_boletos_administradora';
