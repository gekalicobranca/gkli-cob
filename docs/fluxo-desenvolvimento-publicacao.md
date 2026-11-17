# Fluxo de desenvolvimento e publicação

O código é alterado primeiro em uma cópia local limpa, baseada na `main` atual. Cada tarefa usa uma branch `codex/` descritiva; mudanças não são feitas diretamente na `main` nem em diretórios operacionais com alterações pendentes.

## Caminho obrigatório

1. Atualize a `main` local com `git pull --ff-only origin main`.
2. Crie uma branch para a mudança: `git switch -c codex/<descricao>`.
3. Edite e confira localmente. Revise `git status` e `git diff`; adicione ao commit apenas os arquivos da tarefa.
4. Envie a branch ao GitHub e abra um Pull Request para `main`.
5. Aguarde o check `quality` (typecheck e build) e a implantação Preview da Vercel. Revise o resultado antes do merge.
6. Faça merge do PR. Somente o push resultante na `main` pode atualizar o ambiente Production da Vercel.
7. Confirme que a implantação Production está `READY`, ligada ao SHA de `main`, e que o domínio de produção aponta para ela.

## Regras

- Não use deploy manual/local (`vercel deploy`, `vercel --prod`, API de criação de deployment ou upload de build) para Production.
- Não publique código por ferramentas que gravem diretamente no GitHub. O trabalho deve partir da cópia local e ser conferido antes do push.
- Não faça push direto para `main`; proteção de branch exige PR, check `Vercel` e check `quality`.
- Uma preview não é publicação: só o merge aprovado para `main` aciona Production.
- Commits diretos, deploys manuais e alterações de configurações em GitHub/Vercel devem ser excepcionais, registrados e vinculados a uma tarefa. A administração da equipe ainda pode contornar controles de plataforma; os controles técnicos e a revisão do diff devem ser usados para detectar e impedir esse desvio no fluxo normal.

## Cópia local oficial

`C:\Users\Gekali\gkli-cob-main` acompanha a `main` de `gekalicobranca/gkli-cob`. Antes de iniciar uma tarefa, confirme a raiz, o remoto, a branch e um `git status` compreensível. Preserve cópias históricas e alterações preexistentes; não copie arquivos sobre elas nem use `git add .` em árvores com alterações de outra tarefa.
