import type { ReactNode } from 'react'
import { acompanhamento } from '@/features/keila/acompanhamento'
import type { KeilaCaso } from '@/features/keila/queries'
import { EtapasAtendimento } from '@/components/agentes-virtuais/etapas-atendimento'

type Execucao = { status: string; erro_mensagem?: string | null; finalizado_em?: string | null }
type Paineis = { retorno: ReactNode; consulta: ReactNode; conferencia: ReactNode; proposta: ReactNode; resposta: ReactNode }

export function RoteiroAtendimentoKeila({ caso, execucao, paineis }: { caso: KeilaCaso; execucao?: Execucao; paineis: Paineis }) {
  const dados = acompanhamento(caso.payload)
  const eventos = caso.payload.registro_json?.eventos ?? []
  const ultimaPendencia = dados.pendencias.filter(p => p.tipo === 'debitos').sort((a, b) => a.criada_em.localeCompare(b.criada_em)).at(-1)
  const confirmacao = ultimaPendencia?.resolvida_em && ultimaPendencia.evidencia?.trim()
    && (!execucao || (execucao.status === 'sucesso' && execucao.finalizado_em && ultimaPendencia.resolvida_em >= execucao.finalizado_em))
  const conferida = !!confirmacao || eventos.some(e => e.tipo === 'debitos_conferidos')
  const proposta = !!caso.payload.conferencia_proposta || !!caso.payload.acordos?.length || eventos.some(e => e.tipo === 'proposta_preparada')
  const pendentes = dados.pendencias.filter(p => !p.resolvida_em).length
  const mensagens = caso.payload.emails.length + (caso.payload.retornos?.filter(r => r.canal === 'whatsapp').length ?? 0)
  const whatsapp = caso.payload.rascunho_whatsapp
  const resposta = whatsapp ? (whatsapp.liberacao ? 'WhatsApp na fila' : whatsapp.aprovacao ? 'WhatsApp aprovado' : 'Rascunho de WhatsApp')
    : caso.payload.resposta_aprovada ? 'Aprovada · conferir envio' : caso.payload.resposta_simulada?.trim() ? 'Rascunho para revisão' : 'Ainda não preparada'
  return <div className="space-y-4">
    <div><h3 className="font-semibold">Do retorno à resposta</h3><p className="mt-1 text-sm text-slate-600">{caso.payload.estado === 'atendimento_humano' ? 'Prioridade humana: manter a tratativa existente.' : caso.payload.estado === 'concluido' ? 'Atendimento concluído. Consulte as etapas e o histórico.' : 'Abra uma etapa para consultar os detalhes ou continuar o atendimento.'}</p></div>
    <div className="rounded-lg bg-sky-50 p-3 text-sm"><strong>Próxima ação:</strong> {caso.payload.proxima_acao || 'Definir próxima ação.'}</div>
    <EtapasAtendimento etapas={[
      { id: 'retorno-caso', titulo: 'Retorno', situacao: mensagens === 1 ? '1 mensagem' : `${mensagens} mensagens`, descricao: 'Pedido recebido, webmail e histórico.', conteudo: paineis.retorno },
      { id: 'coleta-debitos', titulo: 'Consulta', situacao: execucao ? execucao.status.replaceAll('_', ' ') : 'Consulta não vinculada', descricao: 'Dados da unidade e coleta da administradora.', conteudo: paineis.consulta },
      { id: 'acompanhamento-caso', titulo: 'Conferência', situacao: pendentes ? (pendentes === 1 ? '1 pendência' : `${pendentes} pendências`) : conferida ? 'Conferência registrada' : 'Conferência pendente', descricao: 'Evidências, pendências e prazos.', conteudo: paineis.conferencia },
      { id: 'propostas-caso', titulo: 'Proposta', situacao: caso.payload.acordos?.some(a => a.exige_aprovacao) ? 'Depende de aprovação' : proposta ? 'Proposta registrada' : 'Ainda não preparada', descricao: 'Regras do condomínio e condições do acordo.', conteudo: paineis.proposta },
      { id: 'resposta-caso', titulo: 'Resposta', situacao: resposta, descricao: 'Rascunho, aprovação, envio e andamento.', conteudo: paineis.resposta },
    ]} />
  </div>
}
