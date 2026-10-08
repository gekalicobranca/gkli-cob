import type { SupabaseClient } from '@supabase/supabase-js'

/** Explica registros preservados; também atende resultados de importações anteriores. */
export async function explicarCobrancasPreservadas(db: SupabaseClient, mensagens: string[], limpeza: boolean) {
  const ids = [...new Set(mensagens.filter(m => /já existia|ja existia|Recibo já cadastrado/i.test(m)).flatMap(m => [...m.matchAll(/\(([a-f0-9-]{36})\)/g)].map(x => x[1])))]
  if (!ids.length) return mensagens
  const resultados = await Promise.all([
    db.from('cobrancas').select('id,status_operacional').in('id', ids),
    db.from('acordos').select('cobranca_id').in('cobranca_id', ids),
    db.from('acordo_cobrancas').select('cobranca_id').in('cobranca_id', ids),
    db.from('cobrancas').select('duplicada_de_id').in('duplicada_de_id', ids),
  ])
  // Uma falha na explicação não impede abrir o resultado já gravado.
  if (resultados.some(r => r.error)) return mensagens
  const status = new Map((resultados[0].data ?? []).map(c => [c.id, c.status_operacional]))
  const acordos = new Set([...resultados[1].data ?? [], ...resultados[2].data ?? []].map(c => c.cobranca_id))
  const duplicadas = new Set((resultados[3].data ?? []).map(c => c.duplicada_de_id))
  return mensagens.map(m => {
    if (m.includes('Motivo da preservação:')) return m
    const id = ids.find(id => m.includes(id))
    if (!id) return m
    const motivos: string[] = []
    if (!limpeza) motivos.push('a limpeza das cobranças anteriores não foi selecionada')
    if (status.get(id) === 'regular') motivos.push('cobrança Regular, ainda aos cuidados da administradora; disponível para acordos e fora dos flows')
    if (status.get(id) === 'judicializado') motivos.push('cobrança judicializada; a limpeza abrange apenas Novo e Cobrança ativa')
    if (acordos.has(id)) motivos.push('cobrança vinculada a acordo')
    if (duplicadas.has(id)) motivos.push('possui cobranças duplicadas vinculadas, protegidas pela limpeza')
    if (!motivos.length) motivos.push('registro existente preservado; consulte o status e os vínculos da cobrança')
    return m.replace('cobrança já existia e foi ignorada', 'cobrança já existia e foi preservada, sem criar outra') + ' Motivo da preservação: ' + motivos.join('; ') + '.'
  })
}
