import Link from 'next/link'
import { acompanhamento } from '@/features/keila/acompanhamento'
import type { KeilaCaso } from '@/features/keila/queries'

type Execucao = { status: string; erro_mensagem?: string | null; finalizado_em?: string | null }

export function RoteiroAtendimentoKeila({ caso, execucao }: { caso: KeilaCaso; execucao?: Execucao }) {
  const dados = acompanhamento(caso.payload)
  const eventosJSON = caso.payload.registro_json?.eventos ?? []
  const conferenciaJSON = eventosJSON.findLast(e => e.tipo === 'debitos_conferidos')
  const propostaJSON = eventosJSON.findLast(e => e.tipo === 'proposta_preparada')
  const humano = caso.payload.estado === 'atendimento_humano'
  const concluido = caso.payload.estado === 'concluido'
  const ultimaPendenciaDebitos = dados.pendencias.filter(p => p.tipo === 'debitos').sort((a, b) => a.criada_em.localeCompare(b.criada_em)).at(-1)
  const confirmacao = ultimaPendenciaDebitos?.resolvida_em && ultimaPendenciaDebitos.evidencia?.trim()
    && (!execucao || (execucao.status === 'sucesso' && execucao.finalizado_em && ultimaPendenciaDebitos.resolvida_em >= execucao.finalizado_em))
    ? ultimaPendenciaDebitos : undefined
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const pendencias = dados.pendencias.filter(p => !p.resolvida_em).sort((a, b) => a.prazo.localeCompare(b.prazo))
  const acordos = caso.payload.acordos ?? []
  const proposta = acordos.length > 0 || !!propostaJSON
  const aprovacao = acordos.some(a => a.exige_aprovacao)
  const whatsapp = caso.payload.rascunho_whatsapp
  if(caso.payload.falhas_email?.length && caso.payload.intencao==='outro')return <div className="space-y-3"><h3 className="font-semibold">Recuperar o contato após falha de e-mail</h3><p className="rounded-lg bg-sky-50 p-3 text-sm">{caso.payload.proxima_acao}</p><p className="text-sm">Confira o diagnóstico e o celular, revise o aviso e libere o envio aprovado pela fila de WhatsApp da Keila.</p><Link href="#resposta-caso" className="text-sm underline">Abrir aviso e acompanhamento</Link></div>
  const resposta = !!caso.payload.resposta_simulada?.trim() || !!whatsapp
  const etapas = [
    { titulo: 'Consultar a administradora', situacao: execucao ? execucao.status.replaceAll('_', ' ') : 'Consulta ainda não vinculada',
      detalhe: execucao?.erro_mensagem || (execucao?.status === 'sucesso' ? 'Coleta concluída. Confira o relatório e os débitos da unidade.' : 'Use o agente remoto cadastrado. Sem agente, registre a solicitação à administradora.'), href: '#coleta-debitos', acao: 'Abrir consulta' },
    { titulo: 'Confirmar os débitos', situacao: confirmacao || conferenciaJSON ? 'Conferência registrada' : 'Conferência pendente',
      detalhe: conferenciaJSON?.resumo || confirmacao?.evidencia || 'Registre a fonte, a data da atualização e os débitos conferidos. Não inclua cobranças suspensas ou judiciais.', href: '#acompanhamento-caso', acao: 'Abrir conferência' },
    { titulo: 'Aplicar regras e preparar proposta', situacao: aprovacao ? 'Depende de aprovação' : proposta ? 'Proposta registrada' : 'Proposta ainda não preparada',
      detalhe: propostaJSON?.resumo || 'Confira os percentuais, o limite de parcelas e a régua do condomínio. Revise os valores por unidade antes de apresentar as condições.', href: '#propostas-caso', acao: 'Abrir regras e proposta' },
    { titulo: 'Revisar a resposta', situacao: whatsapp ? (whatsapp.liberacao ? 'WhatsApp liberado · acompanhar envio' : whatsapp.aprovacao ? 'WhatsApp aprovado · aguardando liberação' : 'WhatsApp · rascunho para revisão') : caso.payload.resposta_aprovada ? 'Resposta aprovada · acompanhar envio' : resposta ? 'Rascunho salvo para revisão' : 'Resposta ainda não preparada',
      detalhe: 'A resposta deve apresentar o resultado da consulta e, quando solicitado, a proposta concreta. Salvar o rascunho não envia e-mail.', href: '#resposta-caso', acao: 'Abrir resposta' },
  ]
  return <div className="space-y-4">
    <div><h3 className="font-semibold">Do retorno à resposta</h3><p className="mt-1 text-sm text-slate-600">{humano ? 'Prioridade humana: manter a tratativa existente. Não iniciar outra negociação.' : concluido ? 'Atendimento concluído.' : caso.payload.intencao === 'parcelamento' ? 'Pedido de parcelamento: concluir a consulta e preparar as condições para revisão.' : 'Acompanhe a consulta, as evidências e o texto que será revisado.'}</p></div>
    <div className="rounded-lg bg-sky-50 p-3 text-sm"><strong>Próxima ação:</strong> {caso.payload.proxima_acao || 'Definir próxima ação.'}</div>
    {pendencias.length ? <ul className="space-y-2 text-sm">{pendencias.map(p => <li key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><strong>{humano || concluido ? 'Acompanhamento suspenso' : p.prazo <= hoje ? 'Acompanhar agora' : 'Aguardando retorno'}</strong> · {p.aguardando} · {p.prazo.split('-').reverse().join('/')}<p className="mt-1">{p.proxima_acao}</p><Link className="mt-1 inline-block text-sky-700 underline" href="#acompanhamento-caso">Abrir pendência</Link></li>)}</ul> : null}
    {!humano && !concluido ? <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{etapas.map((etapa, i) => <li key={etapa.titulo} className="min-w-0 rounded-lg border border-slate-200 p-3">
      <h4 className="text-sm font-semibold">{i + 1}. {etapa.titulo}</h4><p className="mt-2 text-sm font-medium text-sky-800">{etapa.situacao}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{etapa.detalhe}</p><Link href={etapa.href} className="mt-3 inline-block text-sm text-sky-700 underline">{etapa.acao}</Link>
    </li>)}</ol> : null}
    {resposta ? <details open><summary className="cursor-pointer text-sm font-semibold">{whatsapp ? 'WhatsApp · revisar no registro de andamento' : caso.payload.resposta_aprovada ? 'Resposta aprovada · confira o envio abaixo' : 'Resposta preparada · revisão pendente'}</summary><p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm">{whatsapp?.texto ?? caso.payload.resposta_aprovada?.texto ?? caso.payload.resposta_simulada}</p></details> : null}
  </div>
}
