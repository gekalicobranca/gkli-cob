import { createAdminClient } from '@/utils/supabase/admin'

export class EmailAdiadoError extends Error {
  constructor(message: string, public agendadaPara?: string) { super(message); this.name = 'EmailAdiadoError' }
}

export async function reservarDisparoEmail(mensagemId: string, remetente: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc('email_reservar_disparo', { p_mensagem: mensagemId, p_remetente: remetente })
  if (error) throw new Error(`Erro ao verificar limite de e-mail: ${error.message}`)
  if (!data?.permitido) throw new EmailAdiadoError(data?.motivo || 'Aguardando agenda de envio.', data?.agendada_para)
  return data.tentativa_id
}

export async function finalizarDisparoEmail(tentativaId: string, estado: 'enviado' | 'falha' | 'incerto') {
  const { error } = await createAdminClient().rpc('email_finalizar_disparo', { p_tentativa: tentativaId, p_estado: estado })
  if (error) throw new Error(`Erro ao registrar tentativa de e-mail: ${error.message}`)
}
