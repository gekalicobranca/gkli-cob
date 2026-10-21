export type AgenteVirtualId = 'keila' | 'lidia'
export const AGENTES_VIRTUAIS = {
  keila: { id: 'keila', nome: 'Keila', marca: 'GEKALI', email: 'keila@gekali.com.br', tipoCaso: 'keila_atendimento', caminho: '/app/gestao/keila', modeloEnv: 'KEILA_OPENAI_MODEL', negociarRpc: 'keila_negociar_acordo' },
  lidia: { id: 'lidia', nome: 'Lidia', marca: 'Genske Advogados', email: 'lidia@genskeadvogados.com.br', tipoCaso: 'lidia_atendimento', caminho: '/app/gestao/lidia', modeloEnv: 'LIDIA_OPENAI_MODEL', negociarRpc: 'lidia_negociar_acordo', carteiraId: '06827218-e2b1-4267-ad8f-81a0ab222cad', pilotoCondominioId: '2fef8e0b-664e-4aad-b7af-1d702c586065' },
} as const

// Autorizações por par condomínio/carteira: não libera outros condomínios dessas carteiras.
export const LIDIA_PILOTOS = [
  { id: AGENTES_VIRTUAIS.lidia.pilotoCondominioId, carteira_id: AGENTES_VIRTUAIS.lidia.carteiraId },
  { id: '47926d7c-030b-4469-8713-b23eda558a56', carteira_id: '36b6c087-56d2-4297-be63-6dcbe02a9f00' },
] as const

export function escopoLidia(carteiraIds: string[] | null): string[] {
  return [...new Set(LIDIA_PILOTOS.map(p => p.carteira_id))]
    .filter(carteira => carteiraIds === null || carteiraIds.includes(carteira))
}

export function condominioCarteiraLidia(condominio: { id: string; carteira_id: string }) {
  return LIDIA_PILOTOS.some(p => p.id === condominio.id && p.carteira_id === condominio.carteira_id)
}

export function validarCondominioLidia(condominio: { id: string; carteira_id: string }) {
  if (!condominioCarteiraLidia(condominio)) {
    throw new Error('Condomínio ou carteira fora do piloto autorizado da Lidia.')
  }
}

export function condominioPilotoLidia(id: string) {
  return LIDIA_PILOTOS.some(p => p.id === id)
}

export function formatarEmailAgente(agenteId: AgenteVirtualId, nome: string, texto: string, agora = new Date()) {
  const agente = AGENTES_VIRTUAIS[agenteId]
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora))
  return `${hora < 12 ? 'Bom dia' : 'Boa tarde'}${nome.trim() ? `, ${nome.trim()}` : ''}\n\n\n${texto.trim()}\n\nAtenciosamente,\n${agente.nome} | ${agente.marca}`
}
