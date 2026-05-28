# Conversão de relatórios — OCR fallback

O conversor agora tenta OCR automaticamente quando a camada textual do PDF é rejeitada por baixa qualidade ou quando o texto parece legível, mas nenhum padrão ativo é reconhecido.

## Quando o OCR entra

1. O parser tenta ler o texto nativo do PDF com `pdf-parse`.
2. A qualidade é medida por volume de texto, caracteres de controle e presença de palavras esperadas.
3. Se a leitura for ruim, o fallback OCR é acionado.
4. O OCR renderiza páginas do PDF em PNG via `pdftoppm` e lê as imagens com `tesseract`.
5. O texto OCR volta para os parsers existentes: Superlógica e HFlex/LiveFacilities.

## Dependências de sistema

O fallback OCR não adiciona dependência NPM. Ele usa binários instalados no servidor:

- `pdftoppm` — pacote Poppler
- `tesseract` — mecanismo OCR
- idiomas `por` e `eng` do Tesseract

Em Linux/Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-por tesseract-ocr-eng
```

Em Windows, instale Poppler e Tesseract, depois garanta que `pdftoppm.exe` e `tesseract.exe` estejam no PATH.

## Variáveis de ambiente

```env
GKLI_OCR_FALLBACK=true
GKLI_OCR_MAX_PAGES=80
GKLI_OCR_DPI=120
```

## Observação para Vercel

A Vercel padrão não costuma disponibilizar `pdftoppm` e `tesseract` no runtime. Nessa hospedagem, o fallback vai informar que o OCR de sistema está indisponível. Para OCR em produção na Vercel, o caminho mais seguro é mover OCR para uma rota/worker externo com esses binários instalados ou usar serviço OCR externo.
