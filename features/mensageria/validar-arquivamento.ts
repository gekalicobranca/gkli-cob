import { arquivamentoDuplicidadesAtivo } from '@/lib/core/cobranca-arquivamento'

/** Defesa adicional antes do envio; a reserva atômica no banco também deve validar. */
export async function validarMensagemSemCobrancaArquivada(db: { from: (table: string) => any }, mensagemId: string) {
  if (!arquivamentoDuplicidadesAtivo()) return
  const { data: mensagem, error } = await db.from('mensagens').select('id,cobranca_id,payload').eq('id', mensagemId).single()
  if (error || !mensagem) throw new Error('Não foi possível validar os débitos da mensagem antes do envio.')
  const { data: itens, error: itensError } = await db.from('lote_itens').select('cobranca_id').eq('mensagem_id', mensagemId)
  if (itensError) throw new Error('Não foi possível validar os vínculos da mensagem antes do envio.')
  const payloadIds = mensagem.payload?.cobranca_ids
  if (payloadIds != null && (!Array.isArray(payloadIds) || payloadIds.some((value: unknown) => typeof value !== 'string'))) {
    throw new Error('Identificação dos débitos da mensagem inválida; revise antes de enviar.')
  }
  const ids = Array.from(new Set([mensagem.cobranca_id, ...(payloadIds ?? []), ...(itens ?? []).map((item: any) => item.cobranca_id)].filter(Boolean)))
  // Evita truncamento silencioso em mensagens consolidadas grandes.
  for (let start = 0; start < ids.length; start += 200) {
    const { data, error: cobrancasError } = await db.from('cobrancas').select('id').in('id', ids.slice(start, start + 200)).not('duplicada_de_id', 'is', null).limit(1)
    if (cobrancasError) throw new Error('Não foi possível verificar o arquivamento dos débitos da mensagem.')
    if (data?.length) throw new Error('Mensagem bloqueada: contém cobrança arquivada por duplicidade. Revise o conteúdo antes de um novo envio.')
  }
}
