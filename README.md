# GKLI-Cob — Login Premium

## Objetivo

Criar uma página de entrada/login mais impactante, inspirada na abertura institucional da GEKALI/GKLI, com:

- visual premium
- identidade institucional preservada
- composição geométrica
- foto em moldura inclinada
- painel de login limpo
- responsividade
- sem alterar banco
- sem quebrar autenticação existente

## Arquivos incluídos

```txt
app/login/page.tsx
components/auth/gkli-login-page.tsx
public/gkli/gkli-login-reference.png
```

## Como aplicar

Copie os arquivos para a raiz do projeto.

Depois rode:

```bash
npm run dev
```

Acesse:

```txt
/login
```

## Observação importante

O formulário está preparado para integração com a autenticação existente.

Se o seu projeto já possui uma action de login, basta ligar o `form action` ou manter a lógica atual da página antiga.

Esta entrega foca na camada visual/UX da entrada.
