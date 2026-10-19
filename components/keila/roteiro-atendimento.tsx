import { formalizacoesPendentes } from '@/features/keila/formalizacao-administradora'
import type { ReactNode } from 'react'
import { acompanhamento } from '@/features/keila/acompanhamento'
import type { KeilaCaso } from '@/features/keila/queries'
import { EtapasAtendimento } from '@/components/agentes-virtuais/etapas-atendimento'
import { atencaoEtapas, type TransporteEtapa } from '@/features/keila/atencao-etapas'
import { createAdminClient } from '@/utils/supabase/admin'

type Execucao = { status: string; erro_mensagem?: string | null; finalizado_em?: string | null }
type Paineis = { retorno: ReactNode; consulta: ReactNode; conferencia: ReactNode; proposta: ReactNode; resposta: ReactNode }

export async function RoteiroAtendimentoKeila({ caso, execucao, paineis }: { caso: KeilaCaso; execucao?: Execucao; paineis: Paineis }) {
  const formalizacoes = formalizacoesPendentes(caso.payload)
  const avisosIds = formalizacoes.map(a => a.formalizacao?.aviso_operador_mensagem_id).filter((id): id is string => !!id)
  const avisos = avisosIds.length ? await createAdminClient().from('mensagens').select('id,status,enviada_em,agendada_para,erro_envio,destinatario,payload').eq('carteira_id',caso.carteira_id).in('id',avisosIds) : null
  const dados = acompanhamento(caso.payload)
  const eventos = caso.payload.registro_json?.eventos ?? []
  const ultimaPendencia = dados.pendencias.filter(p => p.tipo === 'debitos').sort((a, b) => a.criada_em.localeCompare(b.criada_em)).at(-1)
  const confirmacao = ultimaPendencia?.resolvida_em && ultimaPendencia.evidencia?.trim()
    && (!execucao || (execucao.status === 'sucesso' && execucao.finalizado_em && ultimaPendencia.resolvida_em >= execucao.finalizado_em))
  const conferida = !!confirmacao || eventos.some(e => e.tipo === 'debitos_conferidos')
  const proposta = !!caso.payload.conferencia_proposta || !!caso.payload.acordos?.length || eventos.some(e => e.tipo === 'proposta_preparada')
  const mensagens = caso.payload.emails.length + (caso.payload.retornos?.filter(r => r.canal === 'whatsapp').length ?? 0)
  const whatsapp = caso.payload.rascunho_whatsapp
  const ids = [...new Set([caso.payload.resposta_aprovada?.mensagem_id, whatsapp?.liberacao?.mensagem_id].filter((id): id is string => !!id))]
  let envios: (TransporteEtapa | null)[] = []
  if (ids.length) {
    const result = await createAdminClient().from('mensagens').select('id,status,provider_status,erro_envio').eq('carteira_id', caso.carteira_id).in('id', ids)
    envios = ids.map(id => result.error ? null : result.data?.find(m => m.id === id) ?? null)
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const atencao = atencaoEtapas({ payload: caso.payload, execucao, conferida, proposta, envios, hoje })
  const resposta = whatsapp ? (whatsapp.liberacao ? 'WhatsApp liberado · conferir envio' : whatsapp.aprovacao ? 'WhatsApp aprovado' : 'Rascunho de WhatsApp')
    : caso.payload.resposta_aprovada ? 'Aprovada · conferir envio' : caso.payload.resposta_simulada?.trim() ? 'Rascunho para revisão' : 'Ainda não preparada'
  return <div className="space-y-4">
    <div><h3 className="font-semibold">Do retorno à resposta</h3><p className="mt-1 text-sm text-slate-600">{caso.payload.estado === 'atendimento_humano' ? 'Prioridade humana: manter a tratativa existente.' : caso.payload.estado === 'concluido' ? 'Atendimento concluído. Consulte as etapas e o histórico.' : 'Abra uma etapa para consultar os detalhes ou continuar o atendimento.'}</p></div>
    <div className="rounded-lg bg-sky-50 p-3 text-sm"><strong>Próxima ação:</strong> {caso.payload.proxima_acao || 'Definir próxima ação.'}</div>
    {formalizacoes.length ? <section role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"><h4 className="font-semibold">Acordo firmado no app · formalização na administradora pendente</h4><p>Atuação humana: formalizar na administradora e obter termo e boletos. O envio dos documentos depende de aprovação.</p>{formalizacoes.map(a => <div key={a.id}><a className="font-medium text-sky-800 underline" href={`/app/acordos/${a.id}`}>Unidade {a.unidade} · {a.total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {a.parcelas.length} parcela(s)</a><p>{a.parcelas.map(p => `${p.numero}ª: ${p.valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em ${p.vencimento.split('-').reverse().join('/')}`).join(' · ')}</p><details><summary className="cursor-pointer">Evidência do aceite e proposta preservada</summary><p className="mt-2 whitespace-pre-wrap">{a.formalizacao?.evidencia}</p><p>Registro do aceite: {a.formalizacao?.registrada_em}</p></details></div>)}</section> : null}
    {avisosIds.length ? <div className="rounded-lg border p-3 text-sm">
      <strong>Aviso ao operador</strong>
      {avisosIds.map(id => {
        const aviso=avisos?.data?.find(m=>m.id===id)
        let status='Registro do aviso indisponível; conferir antes de reenviar.'
        if(avisos?.error) status='Não foi possível conferir o envio; recarregue.'
        else if(aviso?.status==='enviada') status=`Envio confirmado: ${aviso.enviada_em??''}`
        else if(aviso?.status==='agendada') status=`Na fila de e-mail: ${aviso.agendada_para??''}`
        else if(aviso) status=`Status: ${aviso.status}`+(aviso.erro_envio ? ` — ${aviso.erro_envio}` : '')
        return <div key={id}>
          {aviso ? <p>Para: {aviso.destinatario} · Cópia: {Array.isArray(aviso.payload?.email_cc) ? aviso.payload.email_cc.join('; ') : 'Sem cópia registrada'}</p> : null}
          <p>{status}</p>
        </div>
      })}
    </div> : null}
    <EtapasAtendimento etapas={[
      { id: 'retorno-caso', titulo: 'Retorno', situacao: mensagens === 1 ? '1 mensagem' : `${mensagens} mensagens`, descricao: 'Pedido recebido, webmail e histórico.', conteudo: paineis.retorno, atencao: atencao['retorno-caso'] },
      { id: 'coleta-debitos', titulo: 'Consulta', situacao: execucao ? execucao.status.replaceAll('_', ' ') : 'Consulta não vinculada', descricao: 'Dados da unidade e coleta da administradora.', conteudo: paineis.consulta, atencao: atencao['coleta-debitos'] },
      { id: 'acompanhamento-caso', titulo: 'Conferência', situacao: conferida ? 'Conferência registrada' : 'Conferência pendente', descricao: 'Evidências, pendências e prazos.', conteudo: paineis.conferencia, atencao: atencao['acompanhamento-caso'] },
      { id: 'propostas-caso', titulo: 'Proposta', situacao: formalizacoes.length ? 'Aceita · acordo firmado no app' : caso.payload.acordos?.some(a => a.exige_aprovacao) ? 'Depende de aprovação' : proposta ? 'Proposta registrada' : 'Ainda não preparada', descricao: 'Regras do condomínio e condições do acordo.', conteudo: paineis.proposta, atencao: atencao['propostas-caso'] },
      { id: 'resposta-caso', titulo: 'Resposta', situacao: resposta, descricao: 'Rascunho, aprovação, envio e andamento.', conteudo: paineis.resposta, atencao: atencao['resposta-caso'] },
    ]} />
  </div>
}
