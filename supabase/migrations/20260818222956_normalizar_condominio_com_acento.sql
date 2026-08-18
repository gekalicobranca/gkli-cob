update public.condominios
set
  nome = replace(replace(replace(nome, 'CONDOMINIO', 'CONDOMÍNIO'), 'Condominio', 'Condomínio'), 'condominio', 'condomínio'),
  nome_operacional = replace(replace(replace(nome_operacional, 'CONDOMINIO', 'CONDOMÍNIO'), 'Condominio', 'Condomínio'), 'condominio', 'condomínio')
where nome like '%CONDOMINIO%'
   or nome like '%Condominio%'
   or nome like '%condominio%'
   or nome_operacional like '%CONDOMINIO%'
   or nome_operacional like '%Condominio%'
   or nome_operacional like '%condominio%';
