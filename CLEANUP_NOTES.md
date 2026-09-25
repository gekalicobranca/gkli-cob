# Clean project package

This package contains the application source and excludes local/generated content.

Removed from the clean package:
- `tmp/`, `outputs/`, `backups/`, and generated `output/` contents
- local Supabase temp state
- locally installed `scripts/whatsapp-web/node_modules/`
- duplicate icons under `public/icons/`
- unused visual references under `public/gkli/`
- local operational spreadsheets under `public/processos/`
- TypeScript build cache and `ranking_extract.json`
- local `.env.*` credential files (only `.env.example` remains)

The Python sources previously under `output/automacao_inadimplencia/` were retained at:
`/scripts/automacao-inadimplencia/`

Operational artifacts retained separately are in `app-operational-archive.zip`.
