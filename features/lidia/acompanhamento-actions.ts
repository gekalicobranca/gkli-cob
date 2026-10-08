'use server'
import { salvarAcompanhamentoVirtual } from '../agentes-virtuais/acompanhamento-actions'
export async function salvarAcompanhamentoLidia(form: FormData) { await salvarAcompanhamentoVirtual('lidia', form) }
