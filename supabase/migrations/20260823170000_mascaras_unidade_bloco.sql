alter table public.condominios
  add column if not exists mascara_unidade text,
  add column if not exists mascara_bloco text;

comment on column public.condominios.mascara_unidade is
  'Mascara obrigatoria da identificacao da unidade: 0 para digito, A para letra e * para qualquer caractere.';
comment on column public.condominios.mascara_bloco is
  'Mascara obrigatoria do bloco: 0 para digito, A para letra e * para qualquer caractere.';

create or replace function public.valor_corresponde_mascara(p_valor text, p_mascara text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_valor text := upper(trim(coalesce(p_valor, '')));
  v_mascara text := upper(trim(coalesce(p_mascara, '')));
  v_indice integer;
  v_token text;
  v_caractere text;
begin
  if v_mascara = '' then return true; end if;
  if char_length(v_valor) <> char_length(v_mascara) then return false; end if;

  for v_indice in 1..char_length(v_mascara) loop
    v_token := substr(v_mascara, v_indice, 1);
    v_caractere := substr(v_valor, v_indice, 1);
    if (v_token = '0' and v_caractere !~ '^[0-9]$')
       or (v_token = 'A' and v_caractere !~ '^[A-Z]$')
       or (v_token not in ('0', 'A', '*') and v_caractere <> v_token) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.validar_mascara_unidade_condominio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mascara_unidade text;
  v_mascara_bloco text;
begin
  select c.mascara_unidade, c.mascara_bloco
    into v_mascara_unidade, v_mascara_bloco
    from public.condominios c
   where c.id = new.condominio_id;

  if not public.valor_corresponde_mascara(new.identificacao, v_mascara_unidade) then
    raise exception using errcode = '23514',
      message = format('Formato de unidade invalido. Use a mascara %s.', v_mascara_unidade);
  end if;
  if not public.valor_corresponde_mascara(new.bloco, v_mascara_bloco) then
    raise exception using errcode = '23514',
      message = format('Formato de bloco invalido. Use a mascara %s.', v_mascara_bloco);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_mascara_unidade_condominio on public.unidades;
create trigger trg_validar_mascara_unidade_condominio
before insert or update of identificacao, bloco, condominio_id on public.unidades
for each row execute function public.validar_mascara_unidade_condominio();

with mascaras(nome, mascara_unidade, mascara_bloco) as (
  values
    ('CONDOMÍNIO BEM MOEMA - SETOR COMERCIAL', '000000', '0'),
    ('CONDOMÍNIO BEM MOEMA - SETOR LOJAS', '000000', '0'),
    ('CONDOMÍNIO CYRELA IBIRAPUERA BY YOO - SETOR RESIDENCIAL 1', '000000', '0'),
    ('CONDOMÍNIO EDIFÍCIO GREENPARK PENTHOUSE', '000000', '0'),
    ('CONDOMÍNIO GARDEN CLUB BARRA FUNDA', '00', 'A'),
    ('CONDOMÍNIO HARMONIA 1040 SETOR RESIDENCIAL 2 LOFTS', '000000', '0'),
    ('CONDOMÍNIO PROJECT HOME', '000000', '0'),
    ('CONDOMÍNIO SOMA PERDIZES - RESIDENCIAL', '000000', '0'),
    ('CONDOMÍNIO SQUARE GARDEN CAMPO BELO STUDIOS', 'AA0000', '0'),
    ('CONDOMÍNIO WEST SIDE', '000000', '0'),
    ('EDIFÍCIO PARQUE DOS JEQUITIBÁS', '000000', '0'),
    ('HELVETIA GRAND QUARTIER – GARTEN HAUS CONDOMINIUM', '000000', '0'),
    ('HI VIEW ALTO DA BOA VISTA - SETOR RESIDENCIAL', '0000', '0'),
    ('OLIVA VILA MASCOTE', '000000', '0'),
    ('VERDANA SUITES JARDIM PRUDENCIA SETOR MORADIA TORRE 3', '000', '0')
)
update public.condominios c
   set mascara_unidade = m.mascara_unidade,
       mascara_bloco = m.mascara_bloco
  from mascaras m
 where upper(trim(c.nome)) = upper(m.nome)
    or upper(trim(coalesce(c.nome_operacional, ''))) = upper(m.nome);
