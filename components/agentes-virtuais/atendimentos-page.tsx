import Link from 'next/link'
import { Bot } from 'lucide-react'
import { NegociacaoKeila } from '@/components/keila/negociacao'
import { AcompanhamentoKeila } from '@/components/keila/acompanhamento'
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
  const { casos, unidades, execucoes, condominios } = await getKeilaCasos(scope, selectedId, condominioId, agenteId)
  const estado = first(params.estado)
  const busca = (first(params.q) ?? '').toLocaleLowerCase('pt-BR')
  const lista = casos.filter(c => (!estado || c.payload.estado === estado) &&
    `${c.titulo} ${c.condominio?.nome} ${c.payload.emails.map(e => `${e.nome} ${e.remetente}`).join(' ')}`.toLocaleLowerCase('pt-BR').includes(busca))
  const caso = casos.find(c => c.id === selectedId)
  const execucao = execucoes.find((e: any) => e.id === caso?.payload.execucao_id)
  const podeEditar = ['admin', 'gestor', 'operador'].includes(scope.perfil)
  const tab = first(params.tab)
  const ativos = casos.filter(c => c.payload.estado !== 'concluido')
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const indicadores = [
    ['Casos em andamento', ativos.length],
    ['Pendências para acompanhar', ativos.filter(c => c.payload.estado !== 'atendimento_humano').flatMap(c => acompanhamento(c.payload).pendencias).filter(p => !p.resolvida_em && p.prazo <= hoje).length],
    ['Aguardando administradora', ativos.filter(c => c.payload.estado === 'aguardando_administradora').length],
    ['Atendimento humano', ativos.filter(c => c.payload.estado === 'atendimento_humano').length],
  ]
  return <LitePageShell>
    <LitePageHeader><PageHeader eyebrow="Atendimento por e-mail" title={agente.nome}
      description={`${agente.email} · Acompanhe respostas, consultas de débitos e próximos passos dos casos. Os disparos iniciais são feitos pelos flows.`}
      actions={<><ButtonLink href={`${agente.caminho}?tab=novo`} variant="header">Registrar e-mail</ButtonLink><ButtonLink href={`${agente.caminho}?tab=regras`} variant="header">Regras</ButtonLink></>}
    ><div className="flex flex-wrap gap-3 text-sm"><Link href={agente.caminho} className="underline underline-offset-4">Atendimentos</Link><Link href={`/app/pendencias?tipo=${agente.tipoCaso}`} className="underline underline-offset-4">Pendências</Link><Link href="/app/agente-automatico" className="underline underline-offset-4">Agentes remotos</Link></div></PageHeader></LitePageHeader>
    <LiteKpiStrip><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{indicadores.map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></Card>)}</div></LiteKpiStrip>
    <LiteWorkArea><LiteScrollArea className="h-full space-y-4 pb-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Operação supervisionada: e-mails registrados manualmente e respostas apenas simuladas. Nenhum envio é realizado nesta área.</div>
      {first(params.erro) ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{first(params.erro)}</p> : null}
      {first(params.resultado) ? <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-700">{first(params.resultado)}</p> : null}
      {tab === 'regras' ? <Card className="space-y-4 p-5"><h2 className="text-lg font-semibold">Regras de atendimento</h2><ul className="list-disc space-y-3 pl-5 text-sm text-slate-600">
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
        <Card className="p-4"><form className="flex flex-wrap items-end gap-3"><FormField label="Buscar caso"><Input aria-label="Buscar caso" name="q" defaultValue={first(params.q)} placeholder="Contato ou condomínio" /></FormField><FormField label="Situação"><Select aria-label="Situação" name="estado" defaultValue={estado ?? ''}><option value="">Todas</option>{Object.entries(KEILA_ESTADOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></FormField><Button type="submit" variant="secondary">Filtrar</Button></form></Card>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          <Card className="space-y-3 p-4"><h2 className="font-semibold">Atendimentos</h2><p className="text-xs text-slate-500">Até 200 casos recentes · {lista.length} nesta lista</p>{lista.length ? lista.map(c => <Link key={c.id} href={`${agente.caminho}?caso=${c.id}`} className={`block rounded-lg border p-4 ${caso?.id === c.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <p className="font-semibold">{c.titulo}</p><p className="mt-1 text-xs text-slate-500">{c.condominio?.nome}</p><p className="mt-2 text-sm text-sky-700">{KEILA_ESTADOS[c.payload.estado]}</p><p className="mt-1 text-sm text-slate-600">{c.payload.proxima_acao}</p>{acompanhamento(c.payload).pendencias.filter(p => !p.resolvida_em).map(p => <p key={p.id} className="mt-1 text-xs text-slate-600">Aguardando {p.aguardando} · {p.prazo.split('-').reverse().join('/')}{!['atendimento_humano', 'concluido'].includes(c.payload.estado) && p.prazo <= hoje ? ' · acompanhar agora' : ''}</p>)}<p className="mt-2 text-xs text-slate-500">{c.payload.emails.length} e-mail(s) · {date(c.updated_at)}</p>
          </Link>) : <p className="py-8 text-sm text-slate-500">Nenhum caso registrado para estes filtros.</p>}</Card>
          {caso ? <div className="space-y-4"><Card className="space-y-3 p-5"><h2 className="text-lg font-semibold">{caso.titulo}</h2><p className="text-sm text-slate-600">{KEILA_ESTADOS[caso.payload.estado]} · {caso.payload.estado === 'atendimento_humano' ? 'Responsável: equipe humana' : `Responsável: ${agente.nome} sob supervisão`}</p>
            <p className="text-sm">Autonomia no condomínio: <strong>{caso.condominio?.operacao_virtual_habilitada ? 'habilitada' : 'desabilitada — atendimento supervisionado'}</strong></p>
            <div className="flex flex-wrap gap-2"><ButtonLink href={`/app/condominios/${caso.condominio_id}`} variant="secondary" size="sm">Condomínio</ButtonLink>{unidades.filter((u: any) => caso.payload.unidade_ids.includes(u.id)).map((u: any) => <ButtonLink key={u.id} href={`/app/unidades/${u.id}`} variant="secondary" size="sm">{u.bloco && u.bloco !== '0' ? `Bloco ${u.bloco} · ` : ''}Unidade {u.identificacao}</ButtonLink>)}</div>
            <p className="text-sm"><strong>Próxima ação:</strong> {caso.payload.proxima_acao}</p>
            {execucao ? <div className="rounded-lg bg-slate-50 p-3 text-sm"><p><strong>Coleta remota:</strong> {execucao.status.replaceAll('_', ' ')}</p>{execucao.erro_mensagem ? <p className="mt-2 text-rose-700">{execucao.erro_mensagem}</p> : null}{execucao.arquivos?.map((a: any) => <p key={a.id} className="mt-2">{a.nome_arquivo} · {a.status_validacao.replaceAll('_', ' ')}</p>)}<p className="mt-2 text-xs text-slate-500">Uma coleta concluída ainda precisa de conferência dos débitos da unidade.</p><Link className="mt-2 inline-block text-sky-700 underline" href="/app/agente-automatico">Acompanhar execução e validar relatório</Link></div> : null}
            {podeEditar && !['atendimento_humano', 'concluido'].includes(caso.payload.estado) && (!execucao || ['falha', 'cancelada', 'precisa_intervencao'].includes(execucao.status)) ? <form action={coletar}><input type="hidden" name="id" value={caso.id} /><Button type="submit" variant="secondary">Buscar débitos pelo agente remoto</Button></form> : null}
          </Card><Card className="space-y-4 p-5"><h3 className="font-semibold">E-mails associados</h3>{caso.payload.emails.map(e => <article key={e.chave} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">{e.nome || e.remetente} · {date(e.recebido_em)}</p><p className="text-xs text-slate-500">{e.remetente}</p><p className="mt-2 text-sm font-medium">{e.assunto}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{e.resumo}</p></article>)}</Card>
          <NegociacaoKeila agenteId={agenteId} caso={caso} unidades={unidades.filter((u: { id: string }) => caso.payload.unidade_ids.includes(u.id))} podeEditar={podeEditar} />
          <AcompanhamentoKeila agenteId={agenteId} caso={caso} podeEditar={podeEditar} />
          <Card className="space-y-3 p-5"><h3 className="font-semibold">Histórico de atividades</h3>{caso.payload.atividades.map((a, i) => <div key={`${a.em}:${i}`} className="border-l-2 border-sky-200 pl-3"><p className="text-xs text-slate-500">{date(a.em)}</p><p className="mt-1 whitespace-pre-wrap text-sm">{a.descricao}</p></div>)}</Card>
          {podeEditar ? <Card className="p-5"><h3 className="mb-4 font-semibold">Registrar andamento</h3><form action={atualizar} className="space-y-4"><input type="hidden" name="id" value={caso.id} />
            <FormField label="Situação"><Select aria-label="Situação" name="estado" defaultValue={caso.payload.estado}>{Object.entries(KEILA_ESTADOS).filter(([id]) => caso.payload.estado !== 'atendimento_humano' || ['atendimento_humano', 'concluido'].includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></FormField>
            <FormField label="Atividade realizada"><Textarea aria-label="Atividade realizada" name="descricao" required rows={3} maxLength={4000} /></FormField><FormField label="Próxima ação"><Input aria-label="Próxima ação" name="proxima_acao" defaultValue={caso.payload.proxima_acao} /></FormField>
            <FormField label="Resposta simulada — não será enviada"><Textarea aria-label="Resposta simulada — não será enviada" name="resposta_simulada" defaultValue={caso.payload.resposta_simulada ?? ''} rows={8} /></FormField><Button type="submit">Salvar andamento</Button>
          </form></Card> : caso.payload.resposta_simulada ? <Card className="p-5"><h3 className="font-semibold">Resposta simulada</h3><p className="mt-3 whitespace-pre-wrap text-sm">{caso.payload.resposta_simulada}</p></Card> : null}</div> : <Card className="p-8 text-center text-slate-500"><Bot className="mx-auto mb-3" /><p>{selectedId ? 'Caso não encontrado nas carteiras permitidas.' : 'Selecione um caso para acompanhar mensagens, coleta e atividades.'}</p></Card>}
        </div>
      </>}
    </LiteScrollArea></LiteWorkArea>
  </LitePageShell>
}
