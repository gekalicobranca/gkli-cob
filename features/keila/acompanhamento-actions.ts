'use server'
import { salvarAcompanhamentoVirtual } from '../agentes-virtuais/acompanhamento-actions'
export async function salvarAcompanhamentoKeila(form: FormData) { await salvarAcompanhamentoVirtual('keila', form) }
