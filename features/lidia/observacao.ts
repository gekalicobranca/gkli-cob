import { observarAgenteVirtual, type EntradaObservacaoKeila } from '../keila/observacao'
import { validarCondominioLidia } from '../agentes-virtuais/perfis'

export async function observarLidia(entrada: EntradaObservacaoKeila & { condominio_id: string; carteira_id: string }) {
  validarCondominioLidia({ id: entrada.condominio_id, carteira_id: entrada.carteira_id })
  return observarAgenteVirtual(entrada, 'lidia')
}
