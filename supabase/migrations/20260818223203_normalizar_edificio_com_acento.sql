update public.condominios
set
  nome = replace(replace(replace(nome, 'EDIFICIO', 'EDIFÍCIO'), 'Edificio', 'Edifício'), 'edificio', 'edifício'),
  nome_operacional = replace(replace(replace(nome_operacional, 'EDIFICIO', 'EDIFÍCIO'), 'Edificio', 'Edifício'), 'edificio', 'edifício')
where nome like '%EDIFICIO%'
   or nome like '%Edificio%'
   or nome like '%edificio%'
   or nome_operacional like '%EDIFICIO%'
   or nome_operacional like '%Edificio%'
   or nome_operacional like '%edificio%';
