import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { bancoDocumentos, salvarPdf, verificarCadastro } from './documentos.mjs'

const pasta = process.argv[2]
if (!pasta) throw new Error('Informe a pasta dos PDFs validados.')
const db = bancoDocumentos()
const manifest = JSON.parse(await readFile(new URL('./condominios.json', import.meta.url), 'utf8'))
const resumo = JSON.parse(await readFile(path.join(pasta, 'resumo.json'), 'utf8'))
const { data: condos, error } = await db.from('condominios').select('id,nome,status,administradora,carteira_id').in('id', manifest.condominios.map(c => c.id))
if (error) throw error
for (const c of manifest.condominios) {
  const condo = condos.find(item => item.id === c.id)
  verificarCadastro({ habilitado: true, carteira_id: condo?.carteira_id, codigo_cliente: c.codigo_cliente }, condo, c.codigo_cliente)
}
const { error: seed } = await db.from('agente_acordos_configuracoes').upsert(manifest.condominios.map(c => ({ condominio_id: c.id, carteira_id: condos.find(item => item.id === c.id).carteira_id, codigo_cliente: c.codigo_cliente, habilitado: true })))
if (seed) throw seed
let publicados = 0
for (const resultado of resumo.resultados) {
  if (resultado.status !== 'sucesso') continue
  const arquivo = path.join(pasta, resultado.arquivo_pdf)
  const documento = JSON.parse(await readFile(path.join(pasta, resultado.arquivo_json), 'utf8'))
  const metadata = await salvarPdf(db, arquivo, `validacao/${path.basename(pasta)}/${resultado.arquivo_pdf}`)
  for (const c of resultado.condominios) {
    const condo = condos.find(item => item.id === c.id)
    const { data: existente, error: busca } = await db.from('agente_acordos_execucoes').select('id').eq('condominio_id', c.id).eq('origem', 'validacao_inicial').eq('hash_pdf', metadata.hash_pdf).limit(1)
    if (busca) throw busca
    if (existente.length) continue
    const { error: inserir } = await db.from('agente_acordos_execucoes').insert({ condominio_id: c.id, carteira_id: condo.carteira_id, codigo_cliente: resultado.codigo_cliente, status: 'sucesso', etapa: 'concluido', origem: 'validacao_inicial', created_at: documento.coletado_em, iniciado_em: documento.coletado_em, finalizado_em: documento.coletado_em, ...metadata })
    if (inserir) throw inserir
    publicados++
  }
}
console.log(`${publicados} resultados de PDFs disponibilizados. Nenhum acordo ou parcela importado.`)
