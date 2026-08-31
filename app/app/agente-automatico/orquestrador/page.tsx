import {
  Bot, Building2, CalendarClock, Check, ChevronDown, ChevronRight, CircleDot, Clock3,
  FileCheck2, Filter, Gauge, Layers3, Play, Power, PowerOff, RefreshCw, Route, TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createClient } from '@/utils/supabase/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { alternarCaptacaoGlobal, executarAgenteReceita } from '@/features/agente-automatico/actions'

export const dynamic = 'force-dynamic'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
type EtapaEstado = 'concluida' | 'executando' | 'aguardando' | 'atencao' | 'nao_configurada'
type Etapa = { nome: string; estado: EtapaEstado; detalhe: string; data?: string | null }

const getParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? ''
const normalizar = (value?: string | null) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()
const primeira = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null

function formatarData(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

function estadoExecucao(status?: string | null): EtapaEstado {
  if (status === 'sucesso') return 'concluida'
  if (status === 'em_execucao') return 'executando'
  if (status === 'falha' || status === 'precisa_intervencao') return 'atencao'
  return 'aguardando'
}

function estadoConversao(status?: string | null): EtapaEstado {
  if (status === 'concluido' || status === 'concluido_com_alertas') return 'concluida'
  if (status === 'processando') return 'executando'
  if (status === 'falha' || status === 'erro' || status === 'rejeitado') return 'atencao'
  return 'aguardando'
}

function rotuloEstado(estado: EtapaEstado) {
  return ({ concluida: 'Concluída', executando: 'Em andamento', aguardando: 'Aguardando', atencao: 'Requer atenção', nao_configurada: 'Não configurada' })[estado]
}

function resumoPipeline(etapas: Etapa[]) {
  if (etapas.some((etapa) => etapa.estado === 'atencao')) return { label: 'Requer atenção', tone: 'red' as const }
  if (etapas.some((etapa) => etapa.estado === 'nao_configurada')) return { label: 'Configuração pendente', tone: 'yellow' as const }
  if (etapas.some((etapa) => etapa.estado === 'executando')) return { label: 'Em andamento', tone: 'blue' as const }
  if (etapas.every((etapa) => etapa.estado === 'concluida')) return { label: 'Ciclo concluído', tone: 'green' as const }
  return { label: 'Aguardando próxima etapa', tone: 'slate' as const }
}

function Progresso({ etapas }: { etapas: Etapa[] }) {
  return <div className="grid grid-cols-6 gap-1.5" aria-label="Progresso da captação">
    {etapas.map((etapa) => <div key={etapa.nome} className="min-w-0" title={`${etapa.nome}: ${rotuloEstado(etapa.estado)} — ${etapa.detalhe}`}>
      <p className="mb-1.5 truncate text-[9px] font-medium uppercase tracking-wide text-slate-400 xl:text-[10px]">{etapa.nome}</p>
      <div className={`h-2 rounded-full ${etapa.estado === 'concluida' ? 'bg-emerald-500' : etapa.estado === 'executando' ? 'bg-blue-500' : etapa.estado === 'atencao' ? 'bg-rose-500' : etapa.estado === 'nao_configurada' ? 'bg-amber-400' : 'bg-slate-200'}`} />
    </div>)}
  </div>
}

function EtapaCard({ etapa, ultima }: { etapa: Etapa; ultima: boolean }) {
  const Icon = etapa.estado === 'concluida' ? Check : etapa.estado === 'atencao' ? TriangleAlert : etapa.estado === 'executando' ? RefreshCw : CircleDot
  return <div className="relative min-w-0">
    {!ultima ? <div className="absolute left-[19px] top-5 hidden h-px w-[calc(100%-18px)] bg-slate-200 lg:block" /> : null}
    <div className="relative rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${etapa.estado === 'concluida' ? 'bg-emerald-100 text-emerald-700' : etapa.estado === 'executando' ? 'bg-blue-100 text-blue-700' : etapa.estado === 'atencao' ? 'bg-rose-100 text-rose-700' : etapa.estado === 'nao_configurada' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}><Icon size={14} className={etapa.estado === 'executando' ? 'animate-spin' : ''} /></span>
        <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{etapa.nome}</p><p className="truncate text-[11px] text-slate-500">{rotuloEstado(etapa.estado)}</p></div>
      </div>
      <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-slate-600">{etapa.detalhe}</p>
      {etapa.data ? <p className="mt-1 text-[11px] text-slate-400">{formatarData(etapa.data)}</p> : null}
    </div>
  </div>
}

export default async function MaestroPage({ searchParams }: Props) {
  const params = await searchParams
  const q = getParam(params?.q).trim()
  const carteiraFiltro = getParam(params?.carteira)
  const administradoraFiltro = getParam(params?.administradora)
  const statusFiltro = getParam(params?.status)
  const scope = await getPermittedCarteiras()
  const supabase = await createClient()
  const { data: controleGlobal } = await supabase.from('automacao_controle').select('ativo, atualizado_em').eq('chave', 'captacao_global').maybeSingle()
  const captacaoAtiva = controleGlobal?.ativo !== false

  let condominiosQuery = supabase.from('condominios').select('id, carteira_id, nome, nome_operacional, cnpj, administradora, captacao_dia_mes, captacao_horario, captacao_automatica_habilitada, regua_cobranca_id, carteira:carteiras(id,nome)').eq('status', 'ativo').order('nome')
  condominiosQuery = applyCarteiraScope(condominiosQuery, scope.carteiraIds)
  const { data: condominiosRaw, error: condominiosError } = await condominiosQuery
  if (condominiosError) throw new Error(`Erro ao carregar condomínios do Maestro: ${condominiosError.message}`)

  const condominioIds = (condominiosRaw ?? []).map((row: any) => row.id)
  const [receitasResult, execucoesResult, conversoesResult] = condominioIds.length ? await Promise.all([
    supabase.from('agente_receitas').select('id, carteira_id, nome, script_key, config_json, ativo, administradora:agente_administradoras(id,nome)').eq('ativo', true),
    supabase.from('agente_execucoes').select('id, condominio_id, receita_id, status, origem, competencia, created_at, iniciado_em, finalizado_em, erro_mensagem, arquivos:agente_arquivos(id,nome_arquivo,status_validacao,created_at)').in('condominio_id', condominioIds).is('oculto_em', null).order('created_at', { ascending: false }).limit(1000),
    supabase.from('conversoes_relatorio').select('id, condominio_id, status, total_cobrancas, total_parcelas, criado_em, atualizado_em, inconsistencias_json').in('condominio_id', condominioIds).like('origem', 'captacao_automatizada:%').order('criado_em', { ascending: false }).limit(1000),
  ]) : [{ data: [] }, { data: [] }, { data: [] }] as any

  const receitas = receitasResult.data ?? []
  const execucoes = execucoesResult.data ?? []
  const conversoes = conversoesResult.data ?? []
  const conversaoIdsConcluidas = conversoes.filter((row: any) => ['concluido', 'concluido_com_alertas'].includes(row.status)).map((row: any) => row.id)
  const { data: cobrancasImportadas } = conversaoIdsConcluidas.length
    ? await supabase.from('cobrancas').select('id, condominio_id, conversao_relatorio_id').in('conversao_relatorio_id', conversaoIdsConcluidas).limit(5000)
    : { data: [] as any[] }
  const cobrancaIds = (cobrancasImportadas ?? []).map((row: any) => row.id)
  const { data: mensagensRegua } = cobrancaIds.length
    ? await supabase.from('mensagens').select('id, cobranca_id, status, created_at').in('cobranca_id', cobrancaIds).contains('payload', { origem: 'regua_cobranca' }).order('created_at', { ascending: false }).limit(5000)
    : { data: [] as any[] }
  const mensagensPorCobranca = new Map((mensagensRegua ?? []).map((row: any) => [row.cobranca_id, row]))

  const linhas = (condominiosRaw ?? []).map((condominio: any) => {
    const carteira = primeira(condominio.carteira as any) as any
    const receita = receitas.find((item: any) => item.config_json?.condominio_id === condominio.id) ?? receitas.find((item: any) => {
      const nomeConfigurado = normalizar(item.config_json?.condominio)
      return nomeConfigurado && [normalizar(condominio.nome), normalizar(condominio.nome_operacional)].some((nome) => nome && (nome.includes(nomeConfigurado) || nomeConfigurado.includes(nome)))
    })
    const administradoraAgente = primeira(receita?.administradora as any) as any
    const administradora = condominio.administradora || administradoraAgente?.nome || 'Administradora não informada'
    const execucao = execucoes.find((item: any) => item.condominio_id === condominio.id)
    const arquivos = execucao?.arquivos ?? []
    const arquivo = [...arquivos].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0] as any
    const conversao = conversoes.find((item: any) => item.condominio_id === condominio.id)
    const cobrancas = (cobrancasImportadas ?? []).filter((item: any) => item.conversao_relatorio_id === conversao?.id)
    const mensagem = cobrancas.map((item: any) => mensagensPorCobranca.get(item.id)).filter(Boolean).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0] as any
    const agendaConfigurada = Boolean(condominio.captacao_automatica_habilitada && condominio.captacao_dia_mes && receita?.script_key)
    const conversaoEstado = conversao ? estadoConversao(conversao.status) : 'aguardando'
    const importacaoConcluida = Boolean(conversao && ['concluido', 'concluido_com_alertas'].includes(conversao.status))

    const etapas: Etapa[] = [
      { nome: 'Agenda', estado: agendaConfigurada ? 'concluida' : 'nao_configurada', detalhe: agendaConfigurada ? `Todo dia ${condominio.captacao_dia_mes}, às ${String(condominio.captacao_horario ?? '08:00').slice(0, 5)}` : !condominio.captacao_automatica_habilitada ? 'Captação automática desabilitada' : !receita?.script_key ? 'Agente ainda não vinculado' : 'Dia de execução não definido' },
      { nome: 'Agente', estado: execucao ? estadoExecucao(execucao.status) : 'aguardando', detalhe: execucao?.erro_mensagem || (execucao ? `Execução ${execucao.status.replaceAll('_', ' ')}` : 'Aguardando o primeiro ciclo'), data: execucao?.finalizado_em || execucao?.iniciado_em || execucao?.created_at },
      { nome: 'Arquivo', estado: arquivo ? (arquivo.status_validacao === 'rejeitado' ? 'atencao' : 'concluida') : execucao?.status === 'em_execucao' ? 'executando' : execucao?.status === 'sucesso' ? 'atencao' : 'aguardando', detalhe: arquivo?.nome_arquivo || (execucao?.status === 'sucesso' ? 'Execução terminou sem arquivo vinculado' : 'Aguardando download do relatório'), data: arquivo?.created_at },
      { nome: 'Conversão', estado: conversaoEstado, detalhe: conversao ? `${conversao.total_cobrancas ?? 0} cobranças · ${conversao.total_parcelas ?? 0} parcelas` : 'Aguardando arquivo para converter', data: conversao?.atualizado_em || conversao?.criado_em },
      { nome: 'Importação', estado: importacaoConcluida ? 'concluida' : conversao?.status === 'aguardando_validacao' ? 'atencao' : conversaoEstado === 'atencao' ? 'atencao' : 'aguardando', detalhe: importacaoConcluida ? `${cobrancas.length} cobranças conciliadas` : conversao?.status === 'aguardando_validacao' ? 'Validação manual ainda bloqueia a automação' : 'Aguardando conversão', data: importacaoConcluida ? conversao?.atualizado_em : null },
      { nome: 'Régua', estado: !condominio.regua_cobranca_id ? 'nao_configurada' : mensagem ? 'concluida' : 'aguardando', detalhe: !condominio.regua_cobranca_id ? 'Régua de cobrança não vinculada' : mensagem ? `Acionamento ${String(mensagem.status ?? 'criado').replaceAll('_', ' ')}` : importacaoConcluida ? 'Importada e pronta para o próximo ciclo da régua' : 'Aguardando importação', data: mensagem?.created_at },
    ]
    return { condominio, carteira, administradora, receita, execucao, conversao, etapas, resumo: resumoPipeline(etapas) }
  })

  const carteiras = [...new Map<string, any>(linhas.map((linha: any) => [linha.carteira?.id, linha.carteira] as [string, any]).filter(([id]) => Boolean(id))).values()]
  const administradoras = [...new Set(linhas.map((linha: any) => linha.administradora).filter(Boolean))].sort()
  const filtradas = linhas.filter((linha: any) => {
    const texto = normalizar(`${linha.condominio.nome} ${linha.condominio.nome_operacional} ${linha.condominio.cnpj} ${linha.administradora} ${linha.carteira?.nome}`)
    return (!q || texto.includes(normalizar(q))) && (!carteiraFiltro || linha.condominio.carteira_id === carteiraFiltro) && (!administradoraFiltro || linha.administradora === administradoraFiltro) && (!statusFiltro || linha.resumo.tone === statusFiltro)
  })
  const grupos = new Map<string, typeof filtradas>()
  for (const linha of filtradas) {
    const chave = `${linha.carteira?.nome || 'Sem carteira'}|||${linha.administradora}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha])
  }
  const emFluxo = linhas.filter((linha) => ['blue', 'slate'].includes(linha.resumo.tone)).length
  const atencao = linhas.filter((linha) => ['red', 'yellow'].includes(linha.resumo.tone)).length
  const concluidos = linhas.filter((linha) => linha.resumo.tone === 'green').length

  return <main className="space-y-4">
    <PageHeader eyebrow="Automação" title="Maestro de captação" description="Acompanhe o ciclo completo de cada condomínio — da agenda do agente à entrada na régua de cobrança." actions={<><form action={alternarCaptacaoGlobal}><input type="hidden" name="ativo" value={captacaoAtiva ? 'false' : 'true'} /><Button type="submit" variant="header">{captacaoAtiva ? <PowerOff size={16} /> : <Power size={16} />}{captacaoAtiva ? 'Desligar captação' : 'Ligar captação'}</Button></form><ButtonLink href="/app/agente-automatico" variant="header"><Bot size={16} />Agentes</ButtonLink><ButtonLink href="/app/agente-automatico/maestro" variant="header"><RefreshCw size={16} />Atualizar</ButtonLink></>} />
    <Card className={`flex items-center justify-between gap-4 border ${captacaoAtiva ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${captacaoAtiva ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{captacaoAtiva ? <Power size={18} /> : <PowerOff size={18} />}</span><div><p className={`text-sm font-semibold ${captacaoAtiva ? 'text-emerald-900' : 'text-rose-900'}`}>Captação {captacaoAtiva ? 'ligada' : 'desligada'}</p><p className={`text-xs ${captacaoAtiva ? 'text-emerald-700' : 'text-rose-700'}`}>{captacaoAtiva ? 'Agendas e execuções automáticas estão liberadas.' : 'Novas execuções estão pausadas; agendas e filas foram preservadas.'}</p></div></div>{controleGlobal?.atualizado_em ? <span className="hidden text-xs text-slate-500 md:block">Alterado em {formatarData(controleGlobal.atualizado_em)}</span> : null}</Card>
    <section className="grid gap-3 md:grid-cols-4">
      <Kpi icon={<Building2 size={18} />} label="Condomínios" value={linhas.length} helper="no Maestro" />
      <Kpi icon={<Route size={18} />} label="Em fluxo" value={emFluxo} helper="aguardando ou executando" />
      <Kpi icon={<Check size={18} />} label="Ciclos concluídos" value={concluidos} helper="chegaram à régua" />
      <Kpi icon={<TriangleAlert size={18} />} label="Atenção" value={atencao} helper="erro ou configuração" tone="amber" />
    </section>
    <Card className="p-4"><form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_240px_190px_auto]">
      <Input name="q" defaultValue={q} placeholder="Condomínio, CNPJ ou administradora" />
      <Select name="carteira" defaultValue={carteiraFiltro}><option value="">Todas as carteiras</option>{carteiras.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
      <Select name="administradora" defaultValue={administradoraFiltro}><option value="">Todas as administradoras</option>{administradoras.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
      <Select name="status" defaultValue={statusFiltro}><option value="">Todos os estados</option><option value="blue">Em andamento</option><option value="slate">Aguardando</option><option value="green">Concluído</option><option value="red">Com erro</option><option value="yellow">Configuração pendente</option></Select>
      <Button type="submit"><Filter size={16} />Filtrar</Button>
    </form></Card>
    {!filtradas.length ? <Card className="py-12 text-center"><Gauge className="mx-auto text-slate-300" /><p className="mt-3 font-medium text-slate-900">Nenhum condomínio encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros para visualizar o pipeline.</p></Card> : null}
    {[...grupos.entries()].map(([chave, itens]) => {
      const [carteiraNome, administradoraNome] = chave.split('|||')
      return <details key={chave} open className="group/bloco overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-slate-50/80 px-5 py-4 transition hover:bg-slate-100/80 [&::-webkit-details-marker]:hidden"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--gkli-primary)] shadow-sm"><Layers3 size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{carteiraNome}</p><p className="truncate text-xs text-slate-500">{administradoraNome}</p></div></div><div className="flex items-center gap-3"><Badge tone="slate">{itens.length} condomínio(s)</Badge><ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/bloco:rotate-180" /></div></summary>
        <div className="divide-y divide-slate-100 border-t border-slate-200">{itens.map((linha: any) => <details key={linha.condominio.id} className="group">
          <summary className="grid cursor-pointer list-none gap-4 px-5 py-4 hover:bg-slate-50/70 [&::-webkit-details-marker]:hidden lg:grid-cols-[minmax(250px,1fr)_minmax(260px,0.8fr)_170px_auto] lg:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-950">{linha.condominio.nome_operacional || linha.condominio.nome}</p><ChevronRight size={15} className="shrink-0 text-slate-400 transition group-open:rotate-90" /></div><p className="mt-1 truncate text-xs text-slate-500">CNPJ {linha.condominio.cnpj || '—'} · {linha.receita?.nome || 'Agente não vinculado'}</p></div>
            <div><Progresso etapas={linha.etapas} /><p className="mt-1.5 text-[11px] text-slate-400">{linha.etapas.filter((etapa: Etapa) => etapa.estado === 'concluida').length} de 6 etapas concluídas</p></div><Badge tone={linha.resumo.tone}>{linha.resumo.label}</Badge><span className="text-right text-xs text-slate-500">{formatarData(linha.execucao?.created_at)}</span>
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">{linha.etapas.map((etapa: Etapa, index: number) => <EtapaCard key={etapa.nome} etapa={etapa} ultima={index === linha.etapas.length - 1} />)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><CalendarClock size={14} />{linha.condominio.captacao_dia_mes ? `Próximo ciclo: dia ${linha.condominio.captacao_dia_mes}` : 'Sem agenda'}</span><span className="flex items-center gap-1.5"><FileCheck2 size={14} />{linha.conversao ? `${linha.conversao.total_cobrancas ?? 0} cobranças detectadas` : 'Sem conversão'}</span></div>
              <div className="flex gap-2">{linha.conversao?.status === 'aguardando_validacao' ? <ButtonLink size="sm" href={`/app/configuracoes/lab/captacao-automatizada/${linha.conversao.id}`}>Resolver bloqueio</ButtonLink> : null}{linha.receita?.id ? <form action={executarAgenteReceita}><input type="hidden" name="receita_id" value={linha.receita.id} /><Button size="sm" type="submit" variant="secondary" disabled={['pendente', 'em_execucao'].includes(linha.execucao?.status)}><Play size={14} />Rodar agora</Button></form> : <ButtonLink size="sm" variant="secondary" href="/app/agente-automatico">Configurar agente</ButtonLink>}<ButtonLink size="sm" variant="ghost" href={`/app/condominios/${linha.condominio.id}#cobranca`}>Abrir condomínio</ButtonLink></div>
            </div></div>
        </details>)}</div>
      </details>
    })}
    <Card className="flex items-start gap-3 border-blue-100 bg-blue-50 text-sm text-blue-900"><Clock3 size={18} className="mt-0.5 shrink-0" /><div><p className="font-medium">O Maestro usa os registros reais de cada etapa.</p><p className="mt-1 text-blue-800">Quando uma conversão ainda exige validação manual, ela aparece como bloqueio. Esse indicador identifica os fluxos que ainda precisam ser liberados para operação integralmente autônoma.</p></div></Card>
  </main>
}

function Kpi({ icon, label, value, helper, tone = 'primary' }: { icon: React.ReactNode; label: string; value: number; helper: string; tone?: 'primary' | 'amber' }) {
  return <Card className="relative overflow-hidden p-4"><span className={`absolute right-4 top-4 rounded-xl p-2 ${tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]'}`}>{icon}</span><p className="text-xs font-medium uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></Card>
}
