import Link from 'next/link'
import { Bot, Check, ChevronDown, ChevronRight, CircleDot, Clock3, Download, FileCheck2, Filter, Gauge, History, Layers3, RefreshCw, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'
import { AtualizarFila, ResgatarPdfs } from './controles'

export const dynamic = 'force-dynamic'
type Execucao = { id: string; condominio_id: string; status: string; created_at: string; iniciado_em: string | null; finalizado_em: string | null; mensagem: string | null; storage_path: string | null }
type Condominio = { id: string; nome: string; status: string; administradora: string | null; carteira_id: string | null }
type Config = { condominio_id: string; carteira_id: string; codigo_cliente: string | null; habilitado: boolean; administradora: string; alvos_portal: { nome: string }[]; motivo_pendente: string | null }
const param = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] ?? '' : v ?? ''
const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const data = (v?: string | null) => v ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v)) : '—'
const emFila = (e?: Execucao) => !!e && ['pendente', 'em_execucao'].includes(e.status)
const labels: Record<string, string> = { pendente: 'Na fila', em_execucao: 'Em execução', sucesso: 'PDF disponível', falha: 'Falha', cancelada: 'Cancelada' }
function Estado({ status }: { status?: string }) {
  return <Badge tone={status === 'sucesso' ? 'green' : status === 'falha' ? 'red' : status === 'em_execucao' ? 'blue' : 'slate'}>{status ? labels[status] ?? status : 'Aguardando execução'}</Badge>
}

type EstadoEtapa = 'aguardando' | 'concluida' | 'executando' | 'falha' | 'pendente' | 'cancelada'
const estilosEtapa = {
  aguardando: { rotulo: 'Aguardando', barra: 'bg-slate-200', cor: 'bg-slate-100 text-slate-500', Icon: CircleDot },
  concluida: { rotulo: 'Concluída', barra: 'bg-emerald-500', cor: 'bg-emerald-100 text-emerald-700', Icon: Check },
  executando: { rotulo: 'Em execução', barra: 'bg-blue-500', cor: 'bg-blue-100 text-blue-700', Icon: RefreshCw },
  falha: { rotulo: 'Falha', barra: 'bg-rose-500', cor: 'bg-rose-100 text-rose-700', Icon: TriangleAlert },
  pendente: { rotulo: 'Acesso pendente', barra: 'bg-amber-400', cor: 'bg-amber-100 text-amber-700', Icon: TriangleAlert },
  cancelada: { rotulo: 'Cancelada', barra: 'bg-slate-400', cor: 'bg-slate-100 text-slate-500', Icon: CircleDot },
}
function etapasExecucao(e: Execucao | undefined, habilitado: boolean) {
  const etapa = (nome: string, estado: EstadoEtapa, detalhe: string, data?: string | null) => ({ nome, ...estilosEtapa[estado], detalhe, data, concluida: estado === 'concluida', executando: estado === 'executando' })
  const estadoFinal = e?.status === 'falha' ? 'falha' : e?.status === 'cancelada' ? 'cancelada' : null
  return [
    etapa('Solicitação', e ? 'concluida' : habilitado ? 'aguardando' : 'pendente', e ? 'Solicitação registrada.' : habilitado ? 'Execute o agente para iniciar a coleta.' : 'Configure o acesso para executar.', e?.created_at),
    etapa('Agente', e?.status === 'em_execucao' ? 'executando' : estadoFinal ?? (e?.status === 'sucesso' ? 'concluida' : 'aguardando'), e?.status === 'em_execucao' ? 'Consultando a administradora.' : e?.status === 'sucesso' ? 'Consulta concluída.' : estadoFinal ? 'Coleta interrompida.' : e?.status === 'pendente' ? 'Aguardando a abertura do executor neste computador.' : 'Inicia ao executar manualmente.', e?.iniciado_em),
    etapa('PDF', e?.status === 'sucesso' ? 'concluida' : estadoFinal ?? 'aguardando', e?.status === 'sucesso' ? 'Documento coletado para consulta.' : estadoFinal ? 'Documento não coletado nesta execução.' : 'Disponível após a conclusão da coleta.', e?.finalizado_em),
  ]
}

export default async function AgentesAcordos({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser()
  const params = await searchParams ?? {}
  const busca = param(params.q)
  const carteira = param(params.carteira)
  const status = param(params.status)
  const administradora = param(params.administradora)
  const historico = param(params.aba) === 'historico'
  const db = await createClient()
  const [configResult, condoResult, carteiraResult, execResult, workerResult] = await Promise.all([
    db.from('agente_acordos_configuracoes').select('condominio_id,carteira_id,codigo_cliente,habilitado,administradora,alvos_portal,motivo_pendente'),
    db.from('condominios').select('id,nome,status,administradora,carteira_id').eq('status', 'ativo'),
    db.from('carteiras').select('id,nome').order('nome'),
    db.from('agente_acordos_execucoes').select('id,condominio_id,status,created_at,iniciado_em,finalizado_em,mensagem,storage_path').order('created_at', { ascending: false }).limit(2000),
    db.from('agente_acordos_workers').select('nome,ultimo_sinal').in('nome', ['manager-acordos', 'lello-acordos', 'bbz-acordos', 'atipass-acordos', 'hflex-acordos']),
  ])
  if ([configResult, condoResult, carteiraResult, execResult, workerResult].some(r => r.error)) throw new Error('Não foi possível carregar os agentes de acordos.')
  const condos = new Map((condoResult.data as Condominio[] ?? []).map(c => [c.id, c]))
  const carteiras = new Map((carteiraResult.data ?? []).map(c => [c.id, c.nome as string]))
  const execucoes = execResult.data as Execucao[] ?? []
  const ultima = new Map<string, Execucao>()
  const pdf = new Map<string, Execucao>()
  for (const e of execucoes) {
    if (!ultima.has(e.condominio_id)) ultima.set(e.condominio_id, e)
    if (e.status === 'sucesso' && e.storage_path && !pdf.has(e.condominio_id)) pdf.set(e.condominio_id, e)
  }
  const todos = (configResult.data as Config[] ?? []).filter(c => condos.get(c.condominio_id)?.carteira_id === c.carteira_id)
  const filtrados = todos.filter(c => (!administradora || c.administradora === administradora) && (!carteira || c.carteira_id === carteira) && (!busca || normalizar(`${condos.get(c.condominio_id)?.nome} ${c.codigo_cliente}`).includes(normalizar(busca))) && (!status || (!c.habilitado ? 'acesso_pendente' : ultima.get(c.condominio_id)?.status ?? 'sem_resgate') === status))
  const grupos = new Map<string, Config[]>()
  for (const c of filtrados) {
    const chave = `${c.carteira_id}|||${c.administradora}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), c])
  }
  const workers = new Map((workerResult.data ?? []).map(w => [w.nome, Date.now() - new Date(w.ultimo_sinal).getTime() < 90000]))
  const agentes = ['Manager', 'Lello', 'BBZ', 'ATIPASS', 'HFlex'].filter(a => todos.some(c => c.administradora === a))
  const labelAgente = (a: string) => a === 'BBZ' ? 'BBZ/CondoPro' : a === 'HFlex' ? 'HFlex/LiveFacilities' : a
  const online = (a: string) => !!workers.get(`${a.toLowerCase()}-acordos`)
  const fila = todos.filter(c => emFila(ultima.get(c.condominio_id))).length
  const linkAba = (aba: string) => { const p = new URLSearchParams({ q: busca, carteira, status, administradora, aba }); return `/app/agente-acordos?${p}` }
  const ids = new Set(filtrados.map(c => c.condominio_id))
  const historicoFiltrado = execucoes.filter(e => ids.has(e.condominio_id)).slice(0, 200)
  const aptos = filtrados.filter(c => c.habilitado && ultima.get(c.condominio_id)?.status !== 'em_execucao')
  const indicadores = [
    { titulo: 'Condomínios', valor: todos.length, detalhe: 'com agente de acordos', Icon: Bot },
    { titulo: 'Em execução / na fila', valor: fila, detalhe: 'solicitações em andamento', Icon: Clock3 },
    { titulo: 'PDFs disponíveis', valor: todos.filter(c => pdf.has(c.condominio_id)).length, detalhe: 'com documento para consulta', Icon: FileCheck2 },
    { titulo: 'Atenção', valor: todos.filter(c => !c.habilitado || ultima.get(c.condominio_id)?.status === 'falha').length, detalhe: 'falha ou acesso pendente', Icon: TriangleAlert },
  ]
  return <main className="space-y-4">
    <PageHeader eyebrow="Automação" title="Agentes de acordos" description="Execute a coleta de acordos e acompanhe cada condomínio, da solicitação ao PDF." actions={<AtualizarFila ativa={fila > 0} />} />

    <Card className="space-y-3 border-blue-100 bg-blue-50">
      <div className="flex items-start gap-3"><FileCheck2 size={18} className="mt-0.5 shrink-0 text-blue-700" /><div><p className="text-sm font-semibold text-blue-900">Coleta de PDFs de acordos</p><p className="mt-1 text-xs text-blue-800">Os documentos ficam disponíveis para consulta. Acordos e baixas ainda não são importados.</p></div></div>
      <div className="flex flex-wrap gap-2">{agentes.map(a => <Badge key={a} tone={online(a) ? 'blue' : 'slate'}>{labelAgente(a)} · {online(a) ? 'Em execução' : 'Sob demanda'}</Badge>)}</div>
      <p className="text-xs text-blue-800">O botão Executar agora abre o executor neste computador. Ele coleta os PDFs selecionados e encerra ao terminar, sem agentes permanentes ou agendamentos.</p>
    </Card>

    <nav aria-label="Visualização dos agentes de acordos">
      <Card className="flex flex-wrap items-center gap-2 p-2">{[{ aba: 'pipeline', nome: 'Pipeline', Icon: Layers3 }, { aba: 'historico', nome: 'Histórico', Icon: History }].map(({ aba, nome, Icon }) => {
        const ativa = historico === (aba === 'historico')
        return <Link key={aba} href={linkAba(aba)} aria-current={ativa ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${ativa ? 'bg-slate-950 !text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}><Icon size={16} />{nome}</Link>
      })}</Card>
    </nav>

    <section aria-label="Resumo dos agentes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {indicadores.map(({ titulo, valor, detalhe, Icon }) => <Card key={titulo} className="relative overflow-hidden p-4"><span className={`absolute right-4 top-4 rounded-xl p-2 ${titulo === 'Atenção' ? 'bg-amber-50 text-amber-700' : 'bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]'}`}><Icon size={18} /></span><p className="pr-12 text-xs font-medium uppercase text-slate-400">{titulo}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{valor}</p><p className="mt-1 text-xs text-slate-500">{detalhe}</p></Card>)}
    </section>

    <Card className="p-4">
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_1fr_1fr_1fr_auto]">
        <input type="hidden" name="aba" value={historico ? 'historico' : 'pipeline'} />
        <label className="space-y-1 text-xs text-slate-500">Condomínio ou código<Input name="q" defaultValue={busca} placeholder="Buscar condomínio ou código" /></label>
        <label className="space-y-1 text-xs text-slate-500">Carteira<Select name="carteira" defaultValue={carteira}><option value="">Todas as carteiras</option>{[...new Set(todos.map(c => c.carteira_id))].map(id => <option key={id} value={id}>{carteiras.get(id) ?? 'Sem nome'}</option>)}</Select></label>
        <label className="space-y-1 text-xs text-slate-500">Administradora<Select name="administradora" defaultValue={administradora}><option value="">Todas as administradoras</option>{agentes.map(a => <option key={a} value={a}>{labelAgente(a)}</option>)}</Select></label>
        <label className="space-y-1 text-xs text-slate-500">Status<Select name="status" defaultValue={status}><option value="">Todos os estados</option>{Object.entries(labels).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}<option value="sem_resgate">Aguardando execução</option><option value="acesso_pendente">Acesso pendente</option></Select></label>
        <div className="flex gap-2"><Button type="submit"><Filter size={16} />Filtrar</Button><ButtonLink variant="secondary" href={`/app/agente-acordos?aba=${historico ? 'historico' : 'pipeline'}`}>Limpar</ButtonLink></div>
      </form>
    </Card>

    {!historico && <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold">Execução manual</p><p className="mt-1 text-xs text-slate-500">{filtrados.length} condomínio(s) no filtro · {aptos.length} disponível(is) para executar. Abra um condomínio para executar individualmente. Pedidos na fila podem ser reabertos sem duplicar a solicitação.</p></div><ResgatarPdfs plural ids={aptos.map(c => c.condominio_id)} /></Card>}

    {filtrados.length === 0 ? <Card className="py-12 text-center"><Gauge className="mx-auto text-slate-300" /><p className="mt-3 font-medium text-slate-900">Nenhum condomínio encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros para visualizar os agentes de acordos.</p></Card> : historico ? <Card className="overflow-hidden p-0">
      <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Últimas execuções</h2><p className="mt-1 text-xs text-slate-500">Até 200 solicitações dos condomínios filtrados.</p></div>
      {historicoFiltrado.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th scope="col" className="px-5 py-3">Condomínio</th><th scope="col" className="px-5 py-3">Solicitação</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3">Resultado</th></tr></thead><tbody>{historicoFiltrado.map(e => <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="px-5 py-4 font-medium">{condos.get(e.condominio_id)?.nome}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{data(e.created_at)}</td><td className="px-5 py-4"><Estado status={e.status} /></td><td className="px-5 py-4">{e.status === 'sucesso' && e.storage_path ? <ButtonLink size="sm" variant="secondary" href={`/api/agente-acordos/execucoes/${e.id}/pdf`} download prefetch={false}><Download size={14} />Baixar PDF</ButtonLink> : <span className="text-xs text-slate-500">{e.mensagem ?? (e.status === 'pendente' ? 'Aguardando agente' : '—')}</span>}</td></tr>)}</tbody></table></div> : <div className="py-12 text-center"><History className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">Nenhuma execução registrada para estes condomínios.</p></div>}
    </Card> : [...grupos].sort(([a], [b]) => {
      const [carteiraA, agenteA] = a.split('|||')
      const [carteiraB, agenteB] = b.split('|||')
      return (carteiras.get(carteiraA) ?? '').localeCompare(carteiras.get(carteiraB) ?? '', 'pt-BR') || agenteA.localeCompare(agenteB, 'pt-BR')
    }).map(([chave, configs]) => {
      const [carteiraId, agente] = chave.split('|||')
      return <details key={chave} open className="group/bloco overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-slate-50/80 px-5 py-4 transition hover:bg-slate-100/80 [&::-webkit-details-marker]:hidden"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--gkli-primary)] shadow-sm"><Layers3 size={18} /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-950">{carteiras.get(carteiraId) ?? 'Carteira'}</h2><p className="text-xs text-slate-500">{labelAgente(agente)}</p></div></div><div className="flex items-center gap-3"><Badge tone="slate">{configs.length} condomínio(s)</Badge><ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open/bloco:rotate-180" /></div></summary>
        <div className="divide-y divide-slate-100 border-t border-slate-200">{[...configs].sort((a, b) => (condos.get(a.condominio_id)?.nome ?? '').localeCompare(condos.get(b.condominio_id)?.nome ?? '', 'pt-BR')).map(c => {
          const e = ultima.get(c.condominio_id)
          const arquivo = pdf.get(c.condominio_id)
          const etapas = etapasExecucao(e, c.habilitado)
          return <details key={c.condominio_id} className="group/condominio">
            <summary className="grid cursor-pointer list-none gap-4 px-5 py-4 hover:bg-slate-50/70 [&::-webkit-details-marker]:hidden lg:grid-cols-[minmax(220px,1fr)_minmax(210px,0.8fr)_160px_140px] lg:items-center">
              <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-950">{condos.get(c.condominio_id)?.nome}</p><ChevronRight size={15} className="shrink-0 text-slate-400 transition group-open/condominio:rotate-90" /></div><p className="mt-1 text-xs text-slate-500">{labelAgente(c.administradora)} · {c.codigo_cliente ? `Código ${c.codigo_cliente}` : 'Acesso pendente'}</p></div>
              <div><div className="grid grid-cols-3 gap-1.5" aria-label="Progresso da coleta">{etapas.map(etapa => <div key={etapa.nome} title={`${etapa.nome}: ${etapa.rotulo}`}><p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{etapa.nome}</p><div className={`h-2 rounded-full ${etapa.barra}`} /></div>)}</div><p className="mt-1.5 text-[11px] text-slate-400">{etapas.filter(etapa => etapa.concluida).length} de 3 etapas concluídas</p></div>
              <div>{c.habilitado ? <Estado status={e?.status} /> : <Badge tone="yellow">Acesso pendente</Badge>}</div><div className="text-xs text-slate-500 lg:text-right"><p className="text-[10px] uppercase tracking-wide text-slate-400">Última solicitação</p><p className="mt-1">{data(e?.created_at)}</p></div>
            </summary>
            <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-5 py-5">
              <div className="grid gap-3 md:grid-cols-3">{etapas.map(etapa => <div key={etapa.nome} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${etapa.cor}`}><etapa.Icon size={14} className={etapa.executando ? 'animate-spin' : ''} /></span><div><p className="text-xs font-semibold text-slate-900">{etapa.nome === 'Agente' ? `Agente ${labelAgente(c.administradora)}` : etapa.nome}</p><p className="text-[11px] text-slate-500">{etapa.rotulo}</p></div></div><p className="mt-2 text-xs leading-4 text-slate-600">{etapa.detalhe}</p><p className="mt-1 text-[11px] text-slate-400">{data(etapa.data)}</p></div>)}</div>
              {e?.status === 'falha' && <p role="status" className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800">{e.mensagem ?? 'A coleta falhou. Execute novamente para tentar outra vez.'}</p>}
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-1 text-xs text-slate-500"><p className="flex items-center gap-1.5"><Bot size={14} />{labelAgente(c.administradora)} · <span className={online(c.administradora) ? 'text-blue-700' : 'text-slate-500'}>{online(c.administradora) ? 'Em execução' : 'Sob demanda'}</span></p><p>{['BBZ', 'ATIPASS'].includes(c.administradora) ? 'Aberto e Baixado · Todas unidades' : c.administradora === 'Lello' ? 'Acordos em andamento' : c.administradora === 'HFlex' ? 'Relatório detalhado · Todos os status · Todas unidades e contratos' : 'Somente em Aberto · Todas unidades'}</p>{c.alvos_portal.length > 1 && <p>Inclui {c.alvos_portal.length} acessos: {c.alvos_portal.map(a => a.nome).join(' / ')}</p>}{!c.habilitado && <p className="text-amber-700">{c.motivo_pendente ?? 'Configure o acesso ao portal.'}</p>}{arquivo && <p>Último PDF disponível: {data(arquivo.finalizado_em)}</p>}</div>
                <div className="flex flex-wrap items-start gap-2"><ResgatarPdfs ids={[c.condominio_id]} disabled={!c.habilitado} emFila={e?.status === 'em_execucao'} />{arquivo && <ButtonLink size="sm" variant="secondary" download prefetch={false} href={`/api/agente-acordos/execucoes/${arquivo.id}/pdf`}><Download size={14} />Baixar último PDF</ButtonLink>}<ButtonLink size="sm" variant="ghost" href={`/app/condominios/${c.condominio_id}#cobranca`}>Abrir condomínio</ButtonLink></div>
              </div>
            </div>
          </details>
        })}</div>
      </details>
    })}
  </main>
}
