update public.condominios
set
  nome = upper(nome),
  nome_operacional = upper(nome_operacional)
where nome is distinct from upper(nome)
   or nome_operacional is distinct from upper(nome_operacional);
