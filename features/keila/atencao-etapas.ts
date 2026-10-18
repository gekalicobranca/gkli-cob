import type { KeilaCasoPayload } from './casos'
import type { PendenciaKeila } from './acompanhamento'

export type EtapaId = 'retorno-caso' | 'coleta-debitos' | 'acompanhamento-caso' | 'propostas-caso' | 'resposta-caso'
export type AlertaEtapa = { titulo: string; descricao: string; tom: 'atencao' | 'urgente' | 'humana' | 'aguardando' }
export type AtencaoEtapa = { principal: boolean; pendencias: number; vencidas: number; prazo?: string; alerta?: AlertaEtapa }
export type TransporteEtapa = { status: string; provider_status?: string | null; erro_envio?: string | null }
const destinoPendencia: Record<PendenciaKeila['tipo'], EtapaId> = {
  debitos: 'coleta-debitos', aprovacao: 'propostas-caso', boletos: 'acompanhamento-caso', proposta: 'retorno-caso',
}

/** Orientação visual; não aprova, libera envios ou modifica o atendimento. */
export function atencaoEtapas({ payload, execucao, conferida, proposta, envios, hoje }: {
  payload: KeilaCasoPayload; execucao?: { status: string }; conferida: boolean; proposta: boolean
  envios: (TransporteEtapa | null)[]; hoje: string
}) {
  const etapas = Object.fromEntries(Object.values(destinoPendencia).concat('resposta-caso').map(id => [id, { principal: false, pendencias: 0, vencidas: 0 }])) as Record<EtapaId, AtencaoEtapa>
  const abertas = (payload.acompanhamento?.pendencias ?? []).filter(p => !p.resolvida_em).sort((a, b) => a.prazo.localeCompare(b.prazo))
  for (const p of abertas) {
    const etapa = etapas[destinoPendencia[p.tipo]]
    if (!etapa) continue
    etapa.pendencias++
    if (p.prazo <= hoje) etapa.vencidas++
    etapa.prazo ??= p.prazo
  }
  function marcar(id: EtapaId, titulo: string, descricao: string, tom: AlertaEtapa['tom'] = 'atencao') {
    etapas[id].principal = true
    etapas[id].alerta = { titulo, descricao, tom }
    return etapas
  }
  if (payload.estado === 'concluido') return etapas
  if (payload.estado === 'atendimento_humano') return marcar('acompanhamento-caso', 'Atuação humana', 'Revisar a pendência com a equipe responsável. Não iniciar negociação paralela.', 'humana')
  if (envios.some(e => e?.provider_status === 'incerto')) return marcar('resposta-caso', 'Envio incerto', 'Conferir o transporte antes de qualquer nova tentativa.', 'urgente')
  if (envios.some(e => e?.erro_envio || (e && ['falha', 'erro', 'cancelada'].includes(e.status)))) return marcar('resposta-caso', 'Revisar envio', 'Há falha ou cancelamento registrado. Confira o motivo na resposta.', 'urgente')
  if (execucao && ['falha', 'cancelada', 'precisa_intervencao'].includes(execucao.status)) return marcar('coleta-debitos', 'Consulta precisa de atenção', 'Conferir a execução e o motivo da interrupção.', 'urgente')
  const vencida = abertas.find(p => p.prazo <= hoje)
  if (vencida) return marcar(destinoPendencia[vencida.tipo], 'Prazo até hoje', `Acompanhar: ${vencida.aguardando}.`, 'urgente')
  if (abertas.length) return marcar(destinoPendencia[abertas[0].tipo], 'Pendência aberta', `Acompanhar: ${abertas[0].aguardando}.`)
  if (envios.length) {
    if (envios.every(e => e?.status === 'enviada')) return marcar('retorno-caso', 'Aguardar retorno', 'Envio confirmado. Acompanhar a resposta do contato; envio não comprova leitura.', 'aguardando')
    return marcar('resposta-caso', 'Acompanhar envio', 'Há encaminhamento sem envio confirmado. Confira a fila e o transporte.', 'aguardando')
  }
  if (payload.acordos?.some(a => a.exige_aprovacao)) return marcar('propostas-caso', 'Aprovação do condomínio', 'Conferir a autorização necessária para as condições propostas.')
  if (payload.intencao === 'parcelamento' && payload.resposta_simulada?.trim() && payload.conferencia_proposta?.data_fonte !== hoje) return marcar('acompanhamento-caso', 'Conferir proposta', 'A fonte da proposta precisa de conferência atual antes da aprovação.')
  const whatsapp = payload.rascunho_whatsapp
  if (whatsapp?.aprovacao && !whatsapp.liberacao) return marcar('resposta-caso', 'Aguardando liberação', 'Rascunho aprovado. A liberação de envio ainda depende da ação do operador.')
  if (whatsapp || payload.resposta_simulada?.trim()) return marcar('resposta-caso', 'Revisar resposta', 'Conferir destinatário, texto e condições antes da aprovação.')
  if (payload.falhas_email?.length) return marcar('retorno-caso', 'Revisar contato', 'Conferir a falha de entrega e os dados de contato disponíveis.')
  if (execucao && execucao.status !== 'sucesso') return marcar('coleta-debitos', 'Acompanhar consulta', 'A coleta ainda não foi concluída. Confira o andamento.', 'aguardando')
  if (payload.estado === 'aguardando_administradora') return marcar('coleta-debitos', 'Aguardar administradora', 'Acompanhar a solicitação e registrar o retorno recebido.', 'aguardando')
  if (payload.estado === 'aguardando_retorno') return marcar('retorno-caso', 'Conferir retorno', 'Consultar as mensagens e o histórico do atendimento.', 'aguardando')
  if (!execucao && ['debitos', 'parcelamento'].includes(payload.intencao) && !conferida) return marcar('coleta-debitos', 'Consultar débitos', 'Obter uma fonte da administradora antes de preparar condições.')
  if (!conferida) return marcar('acompanhamento-caso', 'Conferir evidências', 'Revisar a fonte e as pendências antes de avançar.')
  if (payload.intencao === 'parcelamento' && !proposta) return marcar('propostas-caso', 'Preparar proposta', 'Aplicar as regras do condomínio aos débitos conferidos.')
  return marcar('resposta-caso', 'Preparar resposta', 'Registrar o resultado conferido em um rascunho para revisão.')
}
