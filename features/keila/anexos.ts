import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const anexosKeilaSchema = z.array(z.object({
  nome: z.string().regex(/^[^\r\n/\\]{1,180}\.pdf$/i),
  storage_path: z.string().regex(/^keila\/[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})).max(4)
export type AnexoKeila = z.infer<typeof anexosKeilaSchema>[number]

export async function baixarAnexosKeila(db: SupabaseClient, casoId: string, valor: unknown) {
  const refs = anexosKeilaSchema.parse(valor ?? [])
  return Promise.all(refs.map(async ref => {
    if (ref.storage_path !== `keila/${casoId}/${ref.sha256}.pdf`) throw new Error('Anexo fora do atendimento.')
    const { data, error } = await db.storage.from('acordos-pdfs').download(ref.storage_path)
    if (error || !data) throw new Error('Anexo da Keila indisponível.')
    const content = Buffer.from(await data.arrayBuffer())
    if (content.length > 10 * 1024 * 1024 || content.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(content).digest('hex') !== ref.sha256) throw new Error('Integridade do anexo da Keila inválida.')
    return { filename: ref.nome, contentType: 'application/pdf', content }
  }))
}
