'use server'
import { executarAtendimentoVirtual, negociarAtendimentoVirtual } from '../agentes-virtuais/atendimento-actions'

export async function registrarAtendimentoLidia(form: FormData) { await executarAtendimentoVirtual('lidia', form, 'registrar') }
export async function atualizarAtendimentoLidia(form: FormData) { await executarAtendimentoVirtual('lidia', form, 'atualizar') }
export async function coletarDebitosAtendimentoLidia(form: FormData) { await executarAtendimentoVirtual('lidia', form, 'coletar') }
export async function proporAtendimentoLidia(form: FormData) { await negociarAtendimentoVirtual('lidia', form, false) }
export async function aceitarAtendimentoLidia(form: FormData) { await negociarAtendimentoVirtual('lidia', form, true) }
