import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { gerarPdfInadimplencia } from '../../features/condominios/relatorio-inadimplencia/pdf'
import { analiseResumida } from '../../features/condominios/relatorio-inadimplencia/leitura'
import { nomeArquivoRelatorio } from '../../features/condominios/relatorio-inadimplencia/arquivo'

async function main() {
  for (const file of ['.env.local', '.env']) {
    const content = await readFile(file, 'utf8').catch(() => '')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  const id = process.argv[2]
  if (!id) throw new Error('Informe o ID da conversão: npx tsx scripts/relatorios-inadimplencia/exportar.ts <id>')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const result = await db.from('conversoes_relatorio').select('condominio_id,nome_arquivo,preview_json').eq('id', id).single()
  if (result.error) throw result.error
  const row = result.data, preview = row.preview_json
  const condo = await db.from('condominios').select('nome,cnpj,inicio_cobranca_dias,dias_apos_vencimento_regua').eq('id', row.condominio_id).single()
  if (condo.error) throw condo.error
  const units = await db.from('unidades').select('bloco,identificacao,acao_judicial').eq('condominio_id', row.condominio_id)
  if (units.error) throw units.error
  const analise = preview.analiseInadimplencia ?? analiseResumida(preview.rankingMensal, row.nome_arquivo)
  if (!analise.recibos.length) throw new Error('Conversão sem dados financeiros para relatório.')
  const bytes = await gerarPdfInadimplencia(analise, preview.relatorioInadimplenciaContexto ?? {}, {
    inicioCobrancaDias: condo.data.dias_apos_vencimento_regua ?? condo.data.inicio_cobranca_dias, nome: condo.data.nome, cnpj: condo.data.cnpj,
    indicacoesApp: units.data.map(u => ({ bloco: u.bloco ?? '', unidade: u.identificacao ?? '', acaoJudicial: Boolean(u.acao_judicial) })),
  })
  const pasta = path.resolve(process.env.RELATORIOS_INADIMPLENCIA_DIR || 'outputs/relatorios-inadimplencia')
  await mkdir(pasta, { recursive: true })
  const destino = path.join(pasta, nomeArquivoRelatorio(condo.data.cnpj, condo.data.nome))
  // A versão do dia tem nome estável; preservar a anterior antes de substituí-la.
  try {
    const anterior = await readFile(destino)
    if (!anterior.equals(Buffer.from(bytes))) {
      const historico = path.join(pasta, 'historico', String(Date.now()))
      await mkdir(historico, { recursive: true })
      await copyFile(destino, path.join(historico, path.basename(destino)))
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await writeFile(destino, bytes)
  console.log(destino)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
