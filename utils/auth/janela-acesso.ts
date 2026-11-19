export const INICIO_JANELA_ACESSO = Date.parse('2026-11-12T20:00:00-03:00')
export const FIM_JANELA_ACESSO = Date.parse('2026-11-16T09:00:00-03:00')
export const CAMINHO_AVISO_ACESSO = '/acesso-temporariamente-indisponivel'
export const AVISO_ACESSO = 'O acesso ao GKLI Cob será liberado na segunda-feira, 16/11, às 9h, no horário de Brasília. Tente novamente a partir desse horário.'

const JULIO_BAIA_ID = '3a7d6ecb-f85d-4f1e-b1c3-67f20ebe64cc'

export function acessoTemporariamenteBloqueado(userId?: string, agora = Date.now()) {
  return agora >= INICIO_JANELA_ACESSO && agora < FIM_JANELA_ACESSO && userId !== JULIO_BAIA_ID
}

export function precisaAcompanharJanela(userId: string, agora = Date.now()) {
  return agora < FIM_JANELA_ACESSO && userId !== JULIO_BAIA_ID
}
