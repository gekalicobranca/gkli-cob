import { carregarApoiosParaCorrespondencia } from '@/features/responsaveis-unidades/correspondencia'
import { escolherContatoRegua } from '@/features/regua/services/regua-shared'
import { resolverCorrespondenciasUnidade } from '@/lib/core/identidade-unidade'

// Usa a mesma correspondência e escolha de destinatário do processamento da régua.
export function canaisSemDestinatarioFlow(row: any, apoios: any[]) {
  const unidade = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade
  const contatos = resolverCorrespondenciasUnidade({ ...unidade, condominio_id: row.condominio_id }, apoios).correspondencias
  return ['email', 'whatsapp'].filter(canal =>
    !String(escolherContatoRegua({ unidade, apoios: contatos, canal }).destinatario ?? '').trim())
}

export async function carregarContatosFlow(db: { from: (table: string) => any }, rows: any[]) {
  const apoios = await carregarApoiosParaCorrespondencia(db, rows.map(row => row.condominio_id))
  const porCondominio = new Map<string, any[]>()
  for (const apoio of apoios) {
    const list = porCondominio.get(apoio.condominio_id) ?? []
    list.push(apoio)
    porCondominio.set(apoio.condominio_id, list)
  }
  return rows.map(row => ({ ...row, canais_sem_destinatario: canaisSemDestinatarioFlow(row, porCondominio.get(row.condominio_id) ?? []) }))
}
