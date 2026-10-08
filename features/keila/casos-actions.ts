'use server'
import { executarAtendimentoVirtual, negociarAtendimentoVirtual } from '../agentes-virtuais/atendimento-actions'

export async function registrarAtendimentoKeila(form: FormData) { await executarAtendimentoVirtual('keila', form, 'registrar') }
export async function atualizarAtendimentoKeila(form: FormData) { await executarAtendimentoVirtual('keila', form, 'atualizar') }
export async function coletarDebitosAtendimentoKeila(form: FormData) { await executarAtendimentoVirtual('keila', form, 'coletar') }
export async function proporAtendimentoKeila(form: FormData) { await negociarAtendimentoVirtual('keila', form, false) }
export async function aceitarAtendimentoKeila(form: FormData) { await negociarAtendimentoVirtual('keila', form, true) }
