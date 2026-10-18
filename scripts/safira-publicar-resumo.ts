import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { carregarCaso, salvarCaso } from '../features/keila/casos-service'

async function main() {
  const pasta = process.argv[2]
  if (!pasta) throw new Error('Informe a pasta da homologação.')
  const plano = JSON.parse(await readFile(path.join(pasta, 'homologacao.json'), 'utf8')) as { homologavel: boolean; motivo: string | null }[]
  const falhas = JSON.parse(await readFile(path.join(pasta, 'falhas-coleta.json'), 'utf8')) as string[]
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) throw new Error('Configure o ambiente local.')
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const { count, error } = await db.from('lello_recebimentos_safira').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  const texto = `Conciliação Lello: ${plano.filter(p => p.homologavel).length} vínculos homologáveis; ${count} pagamento(s) confirmado(s) pela baixa transacional. ${plano.filter(p => p.motivo === 'vinculo_ambiguo_ou_cronograma_divergente').length} acordos com vínculo/cronograma divergente; ${plano.filter(p => p.motivo === 'situacao_externa_exige_revisao').length} acordos com situação externa para revisão; ${falhas.length} unidade(s) sem coleta concluída. Não corrigir valores, datas históricas, suspensões ou divergências automaticamente.`
  const caso = await carregarCaso(db, 'beb3ba31-1a0d-5ad5-a6e7-7b97e104cf48', ['e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'], 'keila')
  if (['concluido', 'atendimento_humano'].includes(caso.payload.estado)) throw new Error('Resumo assumido por humano ou encerrado; preserve o atendimento.')
  if (caso.payload.proxima_acao === texto) { console.log('Resumo da Keila já está atualizado.'); return }
  await salvarCaso(db, caso, { ...caso.payload, proxima_acao: texto, atividades: [...caso.payload.atividades, { em: new Date().toISOString(), descricao: texto }] }, null)
  console.log('Resumo da conciliação atualizado na Keila, sem envio de mensagem.')
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Falha no resumo.'); process.exitCode = 1 })
