# gkli-cob — padrão total de UI aplicado

## Decisões consolidadas

- Nome do app exibido como `gkli-cob`.
- Sidebar fixa para desktop.
- Versão mobile deixada para etapa própria.
- Identidade monocromática: todos os módulos usam a cor institucional como base.
- Cabeçalho das páginas com fundo institucional e textos brancos.
- Topo do menu com logo GKLI em `/public/logo-gkli.png`.
- Perfil do usuário exibido na mesma linha do nome.

## Arquivos principais ajustados

- `lib/gkli-theme.ts`
- `components/layout/sidebar.tsx`
- `components/ui/page-header.tsx`
- `components/ui/list-page-shell.tsx`
- `app/login/page.tsx`
- `app/layout.tsx`
- `public/logo-gkli.png`
- `public/logo-gkli-mark.png`

## Observação sobre o logo

O arquivo principal do logo deve ficar em:

```txt
/public/logo-gkli.png
```

O código acessa o logo por:

```txt
/logo-gkli.png
```

Também foi incluída uma versão compacta em:

```txt
/public/logo-gkli-mark.png
```

Ela fica disponível para usos futuros em favicons, cards ou versão mobile.
