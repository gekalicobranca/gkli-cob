import type { CobrancaImportadaConciliacao } from './cobrancas-conciliacao'

type SupabaseLike = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>
}

export function conversaoPdfDeCobrancas(preview: { arquivo?: string; tipoConversao?: string } | null) {
  return preview?.tipoConversao === 'cobrancas' && /\.pdf$/i.test(preview.arquivo ?? '')
}

/** Só executa a limpeza depois que todas as linhas da captação foram conferidas. */
export async function removerAusentesDaConversaoPdf(supabase: SupabaseLike, input: {
  conversaoId: string
  condominioId: string
  carteiraId: string
  preview: { cobrancas?: unknown[]; relatorioCompleto?: boolean; parcial?: boolean; recorteRegua?: string }
  importadas: CobrancaImportadaConciliacao[]
  falhas: number
}) {
  const total = input.preview.cobrancas?.length ?? 0
  if (!total || input.falhas || input.importadas.length !== total || input.preview.relatorioCompleto === false
    || input.preview.parcial || (input.preview.recorteRegua && input.preview.recorteRegua !== 'todos')
    || input.importadas.some(item => !item.unidade_id || !item.vencimento)) {
    return { removidas: 0, motivo: 'Limpeza de ausentes não executada: a captação precisa estar completa e sem falhas de importação.' }
  }
  const { data, error } = await supabase.rpc('conversao_remover_cobrancas_ausentes', {
    p_conversao: input.conversaoId, p_condominio: input.condominioId, p_carteira: input.carteiraId,
    p_importadas: input.importadas,
  })
  if (error) throw new Error(`Erro ao remover cobranças ausentes da captação PDF: ${error.message}`)
  return data as { removidas: number; motivo?: string }
}
