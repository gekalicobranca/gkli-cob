export type AgenteVirtualId = 'keila' | 'lidia'
export const AGENTES_VIRTUAIS = {
  keila: { id: 'keila', nome: 'Keila', marca: 'GEKALI', email: 'keila@gekali.com.br', tipoCaso: 'keila_atendimento', caminho: '/app/gestao/keila', modeloEnv: 'KEILA_OPENAI_MODEL', negociarRpc: 'keila_negociar_acordo' },
  lidia: { id: 'lidia', nome: 'Lidia', marca: 'Genske Advogados', email: 'lidia@genskeadvogados.com.br', tipoCaso: 'lidia_atendimento', caminho: '/app/gestao/lidia', modeloEnv: 'LIDIA_OPENAI_MODEL', negociarRpc: 'lidia_negociar_acordo', carteiraId: '06827218-e2b1-4267-ad8f-81a0ab222cad', pilotoCondominioId: '2fef8e0b-664e-4aad-b7af-1d702c586065' },
} as const

export function escopoLidia(carteiraIds: string[] | null): string[] {
  const carteira = AGENTES_VIRTUAIS.lidia.carteiraId
  return carteiraIds === null || carteiraIds.includes(carteira) ? [carteira] : []
}

export function validarCondominioLidia(condominio: { id: string; carteira_id: string }) {
  if (condominio.carteira_id !== AGENTES_VIRTUAIS.lidia.carteiraId || condominio.id !== AGENTES_VIRTUAIS.lidia.pilotoCondominioId) {
    throw new Error('O piloto da Lidia está restrito ao Edifício Oasis, da carteira Genske Advogados.')
  }
}

export function formatarEmailAgente(agenteId: AgenteVirtualId, nome: string, texto: string, agora = new Date()) {
  const agente = AGENTES_VIRTUAIS[agenteId]
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora))
  return `${hora < 12 ? 'Bom dia' : 'Boa tarde'}${nome.trim() ? `, ${nome.trim()}` : ''}\n\n\n${texto.trim()}\n\nAtenciosamente,\n${agente.nome} | ${agente.marca}`
}
