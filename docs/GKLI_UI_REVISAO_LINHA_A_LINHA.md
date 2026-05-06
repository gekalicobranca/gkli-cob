# gkli-cob — Revisão UI linha a linha

## Objetivo
Revisão focada no padrão visual GKLI monocromático, consistência de navegação, acessibilidade básica e pontos de quebra comuns em Next.js App Router.

## Ajustes aplicados

### 1. Botões e links
- Criado `ButtonLink` em `components/ui/button.tsx` para evitar o padrão inválido `<Link><Button /></Link>`.
- Substituídos botões de navegação por `ButtonLink` nas ações principais e botões de cancelar/voltar.
- Mantidos botões reais apenas para ações de formulário, submit e ações server-side.

### 2. Cabeçalhos
- Mantido `PageHeader` único em `components/ui/page-header.tsx`.
- Ajustado import remanescente que ainda vinha de `components/layout/page-header`.
- Cabeçalhos seguem fundo institucional GKLI e textos brancos.

### 3. Rotas quebradas
- Criadas páginas de detalhe para:
  - `/app/condominios/[id]`
  - `/app/unidades/[id]`
- Isso remove o risco de 404 ao clicar nas linhas das listas de condomínios e unidades.

### 4. Segurança do pacote
- Removido `.env.local` do zip final.
- Criado `.env.example` sem chaves reais.
- Removido `tsconfig.tsbuildinfo` do pacote final.

### 5. TypeScript/Next
- Adicionado `next-env.d.ts` para tipos do Next/JSX antes da primeira execução local.

## Pontos revisados e preservados
- Não foram criadas cores por módulo.
- A cor padrão GKLI permanece como base institucional.
- Badges de status continuam usando cores semânticas, pois representam estado/risco e não identidade de módulo.
- A lógica Supabase, ações server-side e queries foram preservadas.

## Validação local
Não foi possível concluir `npm install` neste sandbox porque o comando excedeu o tempo limite. A revisão foi feita por leitura estática, busca de padrões, análise de rotas e correções diretas nos arquivos.
