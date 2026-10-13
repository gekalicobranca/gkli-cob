import { EnviarRespostaKeila } from '@/components/keila/enviar-resposta'
import Link from 'next/link'
import { Bot } from 'lucide-react'
import { NegociacaoKeila } from '@/components/keila/negociacao'
import { RoteiroAtendimentoKeila } from '@/components/keila/roteiro-atendimento'
import { AcompanhamentoKeila } from '@/components/keila/acompanhamento'
import { WebmailKeila, LinksWebmail } from '@/components/keila/webmail'
import { acompanhamento } from '@/features/keila/acompanhamento'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { PageHeader } from '@/components/ui/page-header'
import { LitePageShell, LitePageHeader, LiteKpiStrip, LiteWorkArea, LiteScrollArea } from '@/components/layout/lite-page-shell'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getKeilaCasos } from '@/features/keila/queries'
import { KEILA_ESTADOS } from '@/features/keila/casos'
import { registrarAtendimentoKeila, atualizarAtendimentoKeila, coletarDebitosAtendimentoKeila } from '@/features/keila/casos-actions'
import { registrarAtendimentoLidia, atualizarAtendimentoLidia, coletarDebitosAtendimentoLidia } from '@/features/lidia/actions'
import { AGENTES_VIRTUAIS, escopoLidia, type AgenteVirtualId } from '@/features/agentes-virtuais/perfis'
import { AreaAtendimento } from './area-atendimento'
import { ListCollapsibleFilters, ListFiltersForm, ClearFiltersLink } from '@/components/layout/list-page'
import { filtrarAtendimentos, linkAtendimento, type FiltrosAtendimento } from '@/features/keila/filtros-atendimentos'

type Props = { agenteId: AgenteVirtualId; searchParams?: Promise<Record<string, string | string[] | undefined>> }
function first(v?: string | string[]) { return Array.isArray(v) ? v[0] : v }
function date(v: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) }

export async function AtendimentosAgentePage({ searchParams, agenteId }: Props) {
  const params = await searchParams ?? {}
  const scope = await getPermittedCarteiras()
  const agente = AGENTES_VIRTUAIS[agenteId]
  if (agenteId === 'lidia' && !escopoLidia(scope.carteiraIds).length) return <Card className="m-6 p-5">Você não tem acesso à carteira Genske Advogados.</Card>
  const registrar = agenteId === 'lidia' ? registrarAtendimentoLidia : registrarAtendimentoKeila
  const atualizar = agenteId === 'lidia' ? atualizarAtendimentoLidia : atualizarAtendimentoKeila
  const coletar = agenteId === 'lidia' ? coletarDebitosAtendimentoLidia : coletarDebitosAtendimentoKeila
  const condominioId = first(params.condominio_id) ?? (agenteId === 'lidia' ? AGENTES_VIRTUAIS.lidia.pilotoCondominioId : undefined)
  const selectedId = first(params.caso)
  const tab = first(params.tab)
  const { casos, unidades, execucoes, condominios } = await getKeilaCasos(scope, selectedId, tab === 'novo' ? condominioId : undefined, agenteId)
  const estado = first(params.estado)
  const caso = casos.find(c => c.id === selectedId)
  const execucao = execucoes.find((e: any) => e.id === caso?.payload.execucao_id)
  const podeEditar = ['admin', 'gestor', 'operador'].includes(scope.perfil)
  const ativos = casos.filter(c => c.payload.estado !== 'concluido')
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const filtros: FiltrosAtendimento = Object.fromEntries(['q', 'estado', 'condominio_id', 'intencao', 'resposta', 'prazo', 'ordem'].map(key => [key, first(params[key])]))
  const lista = filtrarAtendimentos(casos, unidades, filtros, hoje)
  const totalFiltros = Object.entries(filtros).filter(([key, value]) => value && key !== 'ordem').length
  const limparHref = linkAtendimento(agente.caminho, {}, selectedId)
  const indicadores = [
    ['Casos em andamento', ativos.length],
    ['Pendências para acompanhar', ativos.filter(c => c.payload.estado !== 'atendimento_humano').flatMap(c => acompanhamento(c.payload).pendencias).filter(p => !p.resolvida_em && p.prazo <= hoje).length],
    ['Aguardando administradora', ativos.filter(c => c.payload.estado === 'aguardando_administradora').length],
    ['Atendimento humano', ativos.filter(c => c.payload.estado === 'atendimento_humano').length],
  ]
  return <LitePageShell>
    <LitePageHeader><PageHeader eyebrow="Atendimento por e-mail" title={agente.nome}
      description={`${agente.email} · Acompanhe respostas, consultas de débitos e próximos passos dos casos. Os disparos iniciais são feitos pelos flows.`}
      actions={<>{agenteId === 'keila' ? <ButtonLink href={`${agente.caminho}?tab=webmail`} variant="header">Webmail · Safira</ButtonLink> : null}<ButtonLink href={`${agente.caminho}?tab=novo`} variant="header">Registrar e-mail</ButtonLink><ButtonLink href={`${agente.caminho}?tab=regras`} variant="header">Regras</ButtonLink></>}
    ><div className="flex flex-wrap gap-3 text-sm"><Link href={agente.caminho} className="underline underline-offset-4">Atendimentos</Link><Link href={`/app/pendencias?tipo=${agente.tipoCaso}`} className="underline underline-offset-4">Pendências</Link><Link href="/app/agente-automatico" className="underline underline-offset-4">Agentes remotos</Link></div></PageHeader></LitePageHeader>
    <LiteKpiStrip><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{indicadores.map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></Card>)}</div></LiteKpiStrip>
    <LiteWorkArea><LiteScrollArea className="h-full space-y-4 pb-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Operação supervisionada: retornos dos flows habilitados são encaminhados ao atendimento quando registrados no app. E-mails também podem ser registrados manualmente. Respostas ficam como rascunho até a aprovação explícita do operador para envio.</div>
      {first(params.erro) ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{first(params.erro)}</p> : null}
      {first(params.resultado) ? <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-700">{first(params.resultado)}</p> : null}
      {tab === 'webmail' && agenteId === 'keila' ? <WebmailKeila carteiraIds={scope.carteiraIds} podeEditar={podeEditar} /> : tab === 'regras' ? <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">Regras de atendimento</h2><ul className="list-disc space-y-3 pl-5 text-sm text-slate-600">
        <li>A habilitação do agente autônomo no condomínio autoriza o atendimento por {agente.nome}. Nesta fase, as ações são coordenadas sob supervisão.</li>
        <li>Associe e-mails referentes às mesmas cobranças ao mesmo caso.</li>
        <li>Débitos atualizados: use o agente remoto cadastrado; sem agente, solicite à administradora e mantenha uma pendência até o retorno. Só informe que solicitou após realizar a solicitação.</li>
        <li>Parcelamento: use os percentuais à vista e parcelados e o limite de parcelas cadastrados no condomínio. Pedidos acima do limite seguem para aprovação. Use apenas débitos atualizados dentro da régua.</li>
        <li>A negociação humana tem prioridade. Se já existe atendimento por outro canal, agradeça e mantenha-se à disposição, sem abrir outra negociação.</li>
        <li>Pagamento informado: solicite o comprovante. Contestação de despesas: explique que são aplicadas as regras do condomínio, sem discutir. Multas por infração exigem avaliação humana.</li>
        <li>Administradoras: apenas boletos ou débitos atualizados quando não houver agente remoto. Síndicos: aprovação de parcelamentos.</li>
        <li>Use “Bom dia, nome” ou “Boa tarde, nome” no horário de São Paulo e deixe duas linhas em branco antes do texto.</li>
      </ul></Card> : tab === 'novo' ? <Card className="p-5"><h2 className="mb-4 text-lg font-semibold">Registrar e-mail recebido</h2>
        <form className="mb-5 flex flex-wrap items-end gap-3"><input type="hidden" name="tab" value="novo" /><FormField label="Condomínio"><Select aria-label="Condomínio" name="condominio_id" defaultValue={condominioId ?? ''} required><option value="">Selecione</option>{condominios.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></FormField><Button type="submit" variant="secondary">Escolher condomínio</Button></form>{podeEditar && condominioId ? <form action={registrar} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="condominio_id" value={condominioId ?? ''} />
        <FormField label="Título do caso"><Input aria-label="Título do caso" name="titulo" required maxLength={200} /></FormField>
        <FormField label="Nome do contato"><Input aria-label="Nome do contato" name="nome" /></FormField><FormField label="E-mail do remetente"><Input aria-label="E-mail do remetente" name="remetente" type="email" required /></FormField>
        <FormField label="Recebido em (São Paulo)"><Input aria-label="Recebido em (São Paulo)" name="recebido_em" type="datetime-local" required /></FormField><FormField label="Assunto"><Input aria-label="Assunto" name="assunto" required /></FormField>
        <FormField label="Pedido"><Select aria-label="Pedido" name="intencao"><option value="debitos">Débitos atualizados</option><option value="parcelamento">Parcelamento</option><option value="outro">Outro</option></Select></FormField>
        <FormField label="Unidades relacionadas (selecione uma ou mais)"><select name="unidade_ids" multiple className="min-h-28 w-full rounded-lg border border-slate-300 p-2 text-sm" aria-label="Unidades relacionadas">{unidades.map((u: any) => <option key={u.id} value={u.id}>{u.bloco && u.bloco !== '0' ? `Bloco ${u.bloco} · ` : ''}Unidade {u.identificacao}</option>)}</select></FormField>
        <FormField label="Referência do atendimento (se a unidade não foi identificada)"><Input aria-label="Referência do atendimento (se a unidade não foi identificada)" name="referencia" /></FormField><FormField label="Próxima ação"><Input aria-label="Próxima ação" name="proxima_acao" required /></FormField>
        <div className="md:col-span-2"><FormField label="Conteúdo do e-mail"><Textarea aria-label="Conteúdo do e-mail" name="resumo" required maxLength={10000} rows={5} /></FormField></div><Button type="submit">Registrar atendimento</Button>
      </form> : <p>{podeEditar ? 'Escolha o condomínio para registrar o e-mail e associar as unidades.' : 'Seu perfil permite apenas consultar os atendimentos.'}</p>}</Card> : <>
        <ListCollapsibleFilters defaultOpen label={`Filtros${totalFiltros ? ` · ${totalFiltros} ativos` : ''}`}>
          <ListFiltersForm className="md:grid-cols-2 xl:grid-cols-4">
            {selectedId ? <input type="hidden" name="caso" value={selectedId} /> : null}
            <div className="md:col-span-2"><FormField label="Buscar atendimento"><Input aria-label="Buscar atendimento" name="q" defaultValue={filtros.q} placeholder="Nome, e-mail, condomínio, unidade ou assunto" /></FormField></div>
            <FormField label="Condomínio"><Select aria-label="Filtrar por condomínio" name="condominio_id" defaultValue={filtros.condominio_id ?? ''}><option value="">Todos os condomínios</option>{condominios.map((c: { id: string; nome: string }) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select></FormField>
            <FormField label="Situação"><Select aria-label="Filtrar por situação" name="estado" defaultValue={estado ?? ''}><option value="">Todas</option>{Object.entries(KEILA_ESTADOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></FormField>
            <FormField label="Pedido"><Select aria-label="Filtrar por pedido" name="intencao" defaultValue={filtros.intencao ?? ''}><option value="">Todos</option><option value="debitos">Débitos atualizados</option><option value="parcelamento">Parcelamento</option><option value="outro">Outro</option></Select></FormField>
            <FormField label="Resposta"><Select aria-label="Filtrar por resposta" name="resposta" defaultValue={filtros.resposta ?? ''}><option value="">Todas</option><option value="sem_resposta">Ainda não preparada</option><option value="rascunho">Rascunho para revisão</option><option value="aprovada">Aprovada · acompanhar envio</option></Select></FormField>
            <FormField label="Acompanhamento"><Select aria-label="Filtrar por acompanhamento" name="prazo" defaultValue={filtros.prazo ?? ''}><option value="">Todos</option><option value="acompanhar">Prazo até hoje</option><option value="pendente">Com pendências abertas</option></Select></FormField>
            <FormField label="Ordenar"><Select aria-label="Ordenar atendimentos" name="ordem" defaultValue={filtros.ordem ?? ''}><option value="">Atualizados recentemente</option><option value="antigos">Sem atualização há mais tempo</option></Select></FormField>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" variant="secondary">Aplicar filtros</Button><ClearFiltersLink href={limparHref} show={totalFiltros > 0 || !!filtros.ordem} /><p role="status" className="text-xs text-slate-500">{lista.length} de {casos.length} atendimentos carregados · até 200 recentes</p></div>
          </ListFiltersForm>
        </ListCollapsibleFilters>
        <div className="space-y-4">
          <AreaAtendimento titulo="Atendimentos" resumo={lista.length} aberta>
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1fr)] gap-4 border-b pb-2 text-xs font-medium uppercase text-slate-400 xl:grid"><span>Contato e condomínio</span><span>Situação e resposta</span><span>Próxima ação</span><span>Atualização</span></div>
            <div className="divide-y divide-slate-100">{lista.length ? lista.map(c => <Link key={c.id} href={`${linkAtendimento(agente.caminho, filtros, c.id)}#detalhes-caso`} aria-current={caso?.id === c.id ? 'true' : undefined} className={`grid min-w-0 gap-3 rounded-lg border-l-4 p-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1fr)] xl:items-start ${caso?.id === c.id ? 'border-cyan-600 bg-cyan-50' : 'border-transparent hover:bg-slate-50'} focus-visible:outline-2 focus-visible:outline-cyan-700`}>
            <div className="min-w-0"><p className="text-sm font-semibold">{c.titulo}</p><p className="mt-1 text-xs text-slate-500">{c.condominio?.nome}</p></div>
            <div><p className="text-sm text-sky-700">{KEILA_ESTADOS[c.payload.estado]}</p><p className="mt-1 text-xs text-slate-600">{c.payload.resposta_aprovada ? 'Resposta aprovada · acompanhar envio' : c.payload.resposta_simulada?.trim() ? 'Rascunho salvo para revisão' : 'Resposta ainda não preparada'}</p></div>
            <div className="min-w-0"><p className="line-clamp-3 text-sm text-slate-600">{c.payload.proxima_acao}</p>{acompanhamento(c.payload).pendencias.filter(p => !p.resolvida_em).map(p => <p key={p.id} className="mt-1 text-xs text-amber-800">Aguardando {p.aguardando} · {p.prazo.split('-').reverse().join('/')}{!['atendimento_humano', 'concluido'].includes(c.payload.estado) && p.prazo <= hoje ? ' · acompanhar agora' : ''}</p>)}</div>
            <div className="text-xs text-slate-500"><p>{date(c.updated_at)}</p><p className="mt-1">{c.payload.emails.length} e-mail(s)</p><span className="mt-2 inline-block font-medium text-cyan-800">{caso?.id === c.id ? 'Caso selecionado' : 'Abrir atendimento'}</span></div>
          </Link>) : <p className="py-8 text-sm text-slate-500">Nenhum caso encontrado. Ajuste ou limpe os filtros.</p>}</div></AreaAtendimento>
          {caso ? <div key={caso.id} id="detalhes-caso" className="scroll-mt-4 space-y-4">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-xs font-medium uppercase text-cyan-800">Atendimento selecionado</p><h2 className="mt-1 text-lg font-semibold">{caso.titulo}</h2><p className="mt-1 text-sm text-slate-600">{caso.condominio?.nome}</p>{!lista.some(c => c.id === caso.id) ? <p className="mt-2 text-sm text-amber-800">Este caso está fora dos filtros atuais. Os detalhes permanecem abertos para consulta.</p> : null}</div>
            <AreaAtendimento titulo="Do retorno à resposta" aberta><RoteiroAtendimentoKeila caso={caso} execucao={execucao} /></AreaAtendimento><AreaAtendimento id="coleta-debitos" titulo="Consulta e dados da unidade"><Card className="space-y-3 p-5"><h2 className="text-lg font-semibold">{caso.titulo}</h2><p className="text-sm text-slate-600">{KEILA_ESTADOS[caso.payload.estado]} · {caso.payload.estado === 'atendimento_humano' ? 'Responsável: equipe humana' : `Responsável: ${agente.nome} sob supervisão`}</p>
            <p className="text-sm">Autonomia no condomínio: <strong>{caso.condominio?.operacao_virtual_habilitada ? 'habilitada' : 'desabilitada — atendimento supervisionado'}</strong></p>
            <div className="flex flex-wrap gap-2"><ButtonLink href={`/app/condominios/${caso.condominio_id}`} variant="secondary" size="sm">Condomínio</ButtonLink>{unidades.filter((u: any) => caso.payload.unidade_ids.includes(u.id)).map((u: any) => <ButtonLink key={u.id} href={`/app/unidades/${u.id}`} variant="secondary" size="sm">{u.bloco && u.bloco !== '0' ? `Bloco ${u.bloco} · ` : ''}Unidade {u.identificacao}</ButtonLink>)}</div>
            <p className="text-sm"><strong>Próxima ação:</strong> {caso.payload.proxima_acao}</p>
            {execucao ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><p><strong>Coleta remota:</strong> {execucao.status.replaceAll('_', ' ')}</p>{execucao.erro_mensagem ? <p className="mt-2 text-rose-700">{execucao.erro_mensagem}</p> : null}{execucao.arquivos?.map((a: any) => <p key={a.id} className="mt-2">{a.nome_arquivo} · {a.status_validacao.replaceAll('_', ' ')}</p>)}<p className="mt-2 text-xs text-slate-500">Uma coleta concluída ainda precisa de conferência dos débitos da unidade.</p><Link className="mt-2 inline-block text-sky-700 underline" href="/app/agente-automatico">Acompanhar execução e validar relatório</Link></div> : null}
            {podeEditar && !['atendimento_humano', 'concluido'].includes(caso.payload.estado) && (!execucao || ['falha', 'cancelada', 'precisa_intervencao'].includes(execucao.status)) ? <form action={coletar}><input type="hidden" name="id" value={caso.id} /><Button type="submit" variant="secondary">Buscar débitos pelo agente remoto</Button></form> : null}
          </Card></AreaAtendimento><AreaAtendimento titulo="Mensagens associadas" resumo={caso.payload.emails.length + (caso.payload.retornos?.filter(r => r.canal === 'whatsapp').length ?? 0)}><div className="space-y-3">{caso.payload.emails.map(e => <article key={e.chave} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">{e.nome || e.remetente} · {date(e.recebido_em)}</p><p className="text-xs text-slate-500">{e.remetente}</p><p className="mt-2 text-sm font-medium">{e.assunto}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{e.resumo}</p></article>)}{caso.payload.retornos?.filter(r => r.canal === 'whatsapp').map(r => <article key={r.chave} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">WhatsApp · {date(r.recebido_em)}</p><p className="text-xs text-slate-500">{r.remetente}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{r.resumo}</p></article>)}</div></AreaAtendimento>
          <AreaAtendimento id="propostas-caso" titulo="Regras e proposta"><NegociacaoKeila agenteId={agenteId} caso={caso} unidades={unidades.filter((u: { id: string }) => caso.payload.unidade_ids.includes(u.id))} podeEditar={podeEditar} /></AreaAtendimento>
          <AreaAtendimento titulo="Referências no webmail"><LinksWebmail emails={caso.payload.emails} /></AreaAtendimento>
          <AreaAtendimento id="acompanhamento-caso" titulo="Conferência e acompanhamento"><AcompanhamentoKeila agenteId={agenteId} caso={caso} podeEditar={podeEditar} /></AreaAtendimento>
          <AreaAtendimento titulo="Histórico de atividades" resumo={caso.payload.atividades.length}>{caso.payload.atividades.map((a, i) => <div key={`${a.em}:${i}`} className="border-l-2 border-sky-200 pl-3"><p className="text-xs text-slate-500">{date(a.em)}</p><p className="mt-1 whitespace-pre-wrap text-sm">{a.descricao}</p></div>)}</AreaAtendimento>
          <AreaAtendimento id="resposta-caso" titulo="Resposta e registro de andamento" resumo={caso.payload.resposta_aprovada ? 'Aprovada' : caso.payload.resposta_simulada?.trim() ? 'Rascunho' : 'Não preparada'}>{agenteId === 'keila' ? <EnviarRespostaKeila caso={caso} podeEditar={podeEditar} /> : null}{podeEditar ? <Card className="p-5"><h3 className="mb-4 font-semibold">Registrar andamento</h3><form action={atualizar} className="space-y-4"><input type="hidden" name="id" value={caso.id} />
            <FormField label="Situação"><Select aria-label="Situação" name="estado" defaultValue={caso.payload.estado}>{Object.entries(KEILA_ESTADOS).filter(([id]) => caso.payload.estado !== 'atendimento_humano' || ['atendimento_humano', 'concluido'].includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></FormField>
            <FormField label="Atividade realizada"><Textarea aria-label="Atividade realizada" name="descricao" required rows={3} maxLength={4000} /></FormField><FormField label="Próxima ação"><Input aria-label="Próxima ação" name="proxima_acao" defaultValue={caso.payload.proxima_acao} /></FormField>
            <FormField label="Rascunho da resposta — salve antes de aprovar"><Textarea aria-label="Rascunho da resposta — salve antes de aprovar" name="resposta_simulada" defaultValue={caso.payload.resposta_simulada ?? ''} rows={8} /></FormField><Button type="submit">Salvar andamento</Button>
          </form></Card> : caso.payload.resposta_simulada ? <Card className="p-5"><h3 className="font-semibold">Resposta simulada</h3><p className="mt-3 whitespace-pre-wrap text-sm">{caso.payload.resposta_simulada}</p></Card> : null}</AreaAtendimento></div> : <Card className="p-8 text-center text-slate-500"><Bot className="mx-auto mb-3" /><p>{selectedId ? 'Caso não encontrado nas carteiras permitidas.' : 'Selecione um caso para acompanhar mensagens, coleta e atividades.'}</p></Card>}
        </div>
      </>}
    </LiteScrollArea></LiteWorkArea>
  </LitePageShell>
}
