import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export function bancoDocumentos() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure o acesso administrativo à fila de PDFs.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}
export async function salvarPdf(db, arquivo, storagePath) {
  const bytes = await readFile(arquivo)
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('O documento recebido não é um PDF.')
  const { error } = await db.storage.from('acordos-pdfs').upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
  return { storage_path: storagePath, nome_pdf: path.basename(arquivo), tamanho_pdf: bytes.length, hash_pdf: createHash('sha256').update(bytes).digest('hex') }
}
export function verificarCadastro(config, condo, codigo) {
  if (!config?.habilitado || !condo || condo.status !== 'ativo' || String(condo.administradora).toLowerCase() !== 'manager' || condo.carteira_id !== config.carteira_id || config.codigo_cliente !== codigo || !/^\d+$/.test(codigo)) throw new Error('Cadastro não está habilitado para coleta de PDFs Manager.')
}
