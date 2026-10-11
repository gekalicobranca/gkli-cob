'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function pausarAgendasSelecionadas(ids: string[]) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { erro: 'Selecione entre 1 e 1000 condomínios válidos.' }
  }
  const db = await createClient()
  const { data, error } = await db.rpc('maestro_pausar_agendas', { p_condominio_ids: [...new Set(ids)] })
  if (error) return { erro: error.message }
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/condominios')
  return { mensagem: `${data.pausadas} agenda(s) pausada(s). ${data.canceladas} execução(ões) pendente(s) cancelada(s).` }
}

export async function limparMontagensSelecionadas(ids: string[]) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { erro: 'Selecione entre 1 e 1000 montagens válidas.' }
  }
  const db = await createClient()
  const { data, error } = await db.rpc('maestro_limpar_montagens', { p_montagem_ids: [...new Set(ids)] })
  if (error) return { erro: error.message }
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/flows/cobranca/email')
  revalidatePath('/app/flows/cobranca/whatsapp')
  return { mensagem: `${data} montagem(ns) encerrada(s) e arquivada(s).` }
}
