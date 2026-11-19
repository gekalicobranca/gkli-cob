# Agentes exclusivos de PDFs — Lello e BBZ/CondoPro

## Integração

`/app/agente-acordos` reúne Manager, Lello e BBZ/CondoPro, com filtro por administradora, histórico e download autenticado por carteira. O manifesto `scripts/acordos-portais/condominios.json` cadastra 8 condomínios Lello e 13 BBZ ativos: vinte habilitados e L’Avance Morumbi com acesso pendente e resgate desabilitado, conforme confirmação do usuário.

Living Wellness Aclimação reúne cinco acessos (quatro subcondomínios e central) em um PDF. A publicação exige sucesso em todos. Safira, Topazio e Co.Next usam credenciais próprias.

```powershell
node --env-file=.env.local scripts/acordos-portais/fila.mjs lello
node --env-file=.env.local scripts/acordos-portais/fila.mjs bbz
# Cadastro idempotente após conferir o manifesto
node --env-file=.env.local scripts/acordos-portais/cadastrar.mjs
```

A migração `20261006040409_agente_acordos_lello_bbz.sql` amplia exclusivamente as tabelas do agente de PDFs e mantém a reivindicação Manager restrita à própria administradora. Consumidores independentes publicam no bucket privado `acordos-pdfs`, atualizam execução e presença próprias e validam administradora, carteira, código e alvos antes de publicar. Não alteram captação, receitas, agendamentos, controle global ou Maestro. Não importam acordos, parcelas, pagamentos nem baixas.

## Coletor manual

```powershell
node scripts/acordos-portais/worker.mjs --portal lello --codigo 182 --condominio "BOSQUE MARAJOARA"
node scripts/acordos-portais/worker.mjs --portal bbz --codigo 00820 --condominio "CLOCK VILA ROMANA"
```

Sem argumentos, apenas mostra ajuda. Opcionais: `--saida`, `--mostrar-navegador`, `--credencial SAFIRA|TOPAZIO|CONEXT|LAVANCE`. Cada chamada atende um alvo e termina. O coletor não acessa Supabase.

Credenciais próprias em `.env.lello-acordos.local` e `.env.bbz-acordos.local`: `LELLO_ACORDOS_USUARIO/SENHA` e `BBZ_ACORDOS_USUARIO/SENHA`. Perfis acrescentam o nome antes de `_USUARIO/SENHA`, por exemplo `LELLO_ACORDOS_CONEXT_USUARIO`. Alternativa: chaves `AGENTE_LELLO_*` ou `AGENTE_BBZ_*` existentes em `.env.local`. O manifesto guarda somente a chave do perfil, nunca a senha.

## Relatórios

- Lello: confirma código e nome, acessa Cotas Atrasadas apenas para encontrar Acordos Em Andamento e baixa o PDF original autenticado. Valida identificação, título e resumo. Quando o portal confirma explicitamente a inexistência de acordos, preserva o HTML de evidência e gera PDF identificado como confirmação de ausência. HTML de login ou erro não representa resultado vazio.
- BBZ: confirma condomínio, abre Acordo Online e seleciona Todas unidades. Preserva Aberto e Baixado, incluindo quitados conforme a fonte. Imprime somente a tabela, percorre páginas quando presentes e verifica todos os processos no PDF final. Parâmetro Inválido não representa relatório vazio.

Saída manual em `Downloads/acordos-portais/<portal>/<execução>/`: PDF, JSON com texto e metadados, resumo com SHA-256 e páginas; BBZ inclui HTML de impressão. Consumidores guardam documentos de cada alvo e consolidado em `Downloads/<portal>-acordos-fila/<job>/`. Falhas não publicam PDF parcial.

Travas por portal ficam em `Downloads/acordos-portais/.<portal>-acordos.lock`, inclusive com outra saída. Consumidores possuem `.fila.lock` separado. Confira se o PID terminou antes de remover uma trava residual. Cada coleta cria navegador e contexto novos, sem reutilizar sessões da captação.

## Verificação

```powershell
node --test scripts/acordos-portais/*.test.mjs scripts/manager-acordos/*.test.mjs
npm run typecheck
npx eslint app/app/agente-acordos/page.tsx app/app/agente-acordos/actions.ts
```

27 testes passaram, incluindo isolamento das reivindicações, permissões do RPC e alterações de cadastro. Typecheck e ESLint passaram. Os oito Lello foram coletados com sucesso em 06/10/2026; Tour de Lion confirmou ausência de acordos. Download autenticado BBZ foi verificado na página integrada. Bosque (1 página, 4 acordos) e Clock (8 páginas, 95 processos) tiveram todas as páginas renderizadas e conferidas visualmente na validação dos coletores.



## Atipass — Residencial das Ilhas

Integrado à fila exclusiva em 06/10/2026. Entrada pelo site Atipass, Área do Cliente, com AGENTE_ATIPASS_USUARIO/SENHA existentes. O login abre nova aba no servc7.webware.com.br; a coleta exige identificação Cond Res das Ilhas. Coleta Aberto e Baixado, Todas unidades, com 100 registros por página e percorre todas as opções de paginação. Validação inicial: 438 processos, 5 páginas do portal, PDF de 42 páginas publicado no histórico.

O portal não informa código de condomínio na tela observada. Para Atipass, codigo_cliente e código do alvo usam explicitamente o UUID interno do condomínio (não um código inventado do portal); a restrição no banco exige igualdade com condominio_id. A sessão é validada pelo título antes da coleta e em cada página.

Consumidor: `node --env-file=.env.local scripts/acordos-portais/fila.mjs atipass`. Migrações aplicadas e sincronizadas com os nomes do histórico remoto.

### Exclusões de conciliação autorizadas

Em 06/10/2026, o usuário descartou do Residencial das Ilhas os processos Atipass 734091 (3/0071), 546618 (3/0093) e 277138 (4/0072). Não importar esses processos em conciliações futuras; consultar `scripts/acordos-portais/exclusoes-conciliacao.json` antes de propor novos cadastros. Decisão restrita aos processos indicados: unidades e cobranças existentes permanecem no app. Os PDFs continuam reproduzindo integralmente a fonte. Os três judiciais identificados foram registrados e as pendências desse lote estão encerradas.
