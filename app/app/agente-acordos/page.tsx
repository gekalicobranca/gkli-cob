import Link from 'next/link'
import { Bot, Check, ChevronDown, Clock3, Download, FileCheck2, Filter, History, Layers3 } from 'lucide-react'
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
type Config = { condominio_id: string; carteira_id: string; codigo_cliente: string; habilitado: boolean }
const param = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] ?? '' : v ?? ''
const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const data = (v?: string | null) => v ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v)) : '—'
const emFila = (e?: Execucao) => !!e && ['pendente', 'em_execucao'].includes(e.status)
const labels: Record<string, string> = { pendente: 'Na fila', em_execucao: 'Resgatando', sucesso: 'PDF disponível', falha: 'Falha', cancelada: 'Cancelada' }
function Estado({ status }: { status?: string }) {
  return <Badge tone={status === 'sucesso' ? 'green' : status === 'falha' ? 'red' : status === 'em_execucao' ? 'blue' : 'slate'}>{status ? labels[status] ?? status : 'Sem resgate'}</Badge>
}

export default async function AgentesAcordos({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser()
  const params = await searchParams ?? {}
  const busca = param(params.q)
  const carteira = param(params.carteira)
  const status = param(params.status)
  const historico = param(params.aba) === 'historico'
  const db = await createClient()
  const [configResult, condoResult, carteiraResult, execResult, workerResult] = await Promise.all([
    db.from('agente_acordos_configuracoes').select('condominio_id,carteira_id,codigo_cliente,habilitado').eq('habilitado', true),
    db.from('condominios').select('id,nome,status,administradora,carteira_id').eq('status', 'ativo').ilike('administradora', 'manager'),
    db.from('carteiras').select('id,nome').order('nome'),
    db.from('agente_acordos_execucoes').select('id,condominio_id,status,created_at,iniciado_em,finalizado_em,mensagem,storage_path').order('created_at', { ascending: false }).limit(2000),
    db.from('agente_acordos_workers').select('ultimo_sinal').eq('nome', 'manager-acordos').maybeSingle(),
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
  const filtrados = todos.filter(c => (!carteira || c.carteira_id === carteira) && (!busca || normalizar(`${condos.get(c.condominio_id)?.nome} ${c.codigo_cliente}`).includes(normalizar(busca))) && (!status || (ultima.get(c.condominio_id)?.status ?? 'sem_resgate') === status))
  const grupos = new Map<string, Config[]>()
  for (const c of filtrados) grupos.set(c.carteira_id, [...(grupos.get(c.carteira_id) ?? []), c])
  const online = !!workerResult.data && Date.now() - new Date(workerResult.data.ultimo_sinal).getTime() < 90000
  const fila = todos.filter(c => emFila(ultima.get(c.condominio_id))).length
  const linkAba = (aba: string) => { const p = new URLSearchParams({ q: busca, carteira, status, aba }); return `/app/agente-acordos?${p}` }
  const ids = new Set(filtrados.map(c => c.condominio_id))
  return <div className="space-y-4">
    <PageHeader eyebrow="Automação" title="Agentes de acordos" description="Resgate os PDFs dos acordos em aberto na administradora e acompanhe cada condomínio." actions={<AtualizarFila ativa={fila > 0} />} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Condomínios configurados', todos.length, Bot], ['PDFs disponíveis', todos.filter(c => pdf.has(c.condominio_id)).length, FileCheck2], ['Na fila / resgatando', fila, Clock3], ['Falhas no último resgate', todos.filter(c => ultima.get(c.condominio_id)?.status === 'falha').length, History]].map(([titulo, valor, Icon]) => {
        const Indicador = Icon as typeof Bot
        return <Card key={String(titulo)} className="flex items-center justify-between"><div><p className="text-xs uppercase text-slate-500">{String(titulo)}</p><p className="mt-2 text-2xl font-semibold">{String(valor)}</p></div><Indicador className="h-5 w-5 text-cyan-700" /></Card>
      })}
    </div>
    <Card className="flex flex-wrap items-center justify-between gap-3 border-cyan-100 bg-cyan-50/40">
      <div><p className="text-sm font-semibold">Etapa atual: coleta de PDFs</p><p className="mt-1 text-xs text-slate-600">Os documentos ficam disponíveis para consulta. Acordos e baixas ainda não são importados.</p></div>
      <div className="text-right"><Badge tone={online ? 'green' : 'yellow'}>{online ? 'Agente online' : 'Agente offline'}</Badge>{!online && <p className="mt-1 text-xs text-slate-500">Solicitações aguardam o agente ficar online.</p>}</div>
    </Card>
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1"><ButtonLink variant={historico ? 'ghost' : 'primary'} size="sm" href={linkAba('pipeline')}><Layers3 className="h-4 w-4" />Pipeline</ButtonLink><ButtonLink variant={historico ? 'primary' : 'ghost'} size="sm" href={linkAba('historico')}><History className="h-4 w-4" />Histórico</ButtonLink></div><ResgatarPdfs plural ids={filtrados.filter(c => !emFila(ultima.get(c.condominio_id))).map(c => c.condominio_id)} /></div>
      <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto]">
        <input type="hidden" name="aba" value={historico ? 'historico' : 'pipeline'} />
        <label className="space-y-1 text-xs text-slate-500">CONDOMÍNIO OU CÓDIGO<Input name="q" defaultValue={busca} placeholder="Buscar condomínio ou código Manager" /></label>
        <label className="space-y-1 text-xs text-slate-500">CARTEIRA<Select name="carteira" defaultValue={carteira}><option value="">Todas</option>{[...new Set(todos.map(c => c.carteira_id))].map(id => <option key={id} value={id}>{carteiras.get(id) ?? 'Sem nome'}</option>)}</Select></label>
        <label className="space-y-1 text-xs text-slate-500">STATUS<Select name="status" defaultValue={status}><option value="">Todos</option>{Object.entries(labels).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}<option value="sem_resgate">Sem resgate</option></Select></label>
        <Button type="submit"><Filter className="h-4 w-4" />Filtrar</Button>
      </form>
    </Card>
    {filtrados.length === 0 && <Card><p className="text-sm text-slate-500">Nenhum agente encontrado com estes filtros.</p></Card>}
    {historico ? <Card className="overflow-x-auto"><p className="mb-3 text-sm font-semibold">Últimas execuções</p><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-2">Condomínio</th><th className="p-2">Solicitação</th><th className="p-2">Status</th><th className="p-2">Resultado</th></tr></thead><tbody>{execucoes.filter(e => ids.has(e.condominio_id)).slice(0, 200).map(e => <tr key={e.id} className="border-b border-slate-100"><td className="p-2">{condos.get(e.condominio_id)?.nome}</td><td className="whitespace-nowrap p-2 text-xs">{data(e.created_at)}</td><td className="p-2"><Estado status={e.status} /></td><td className="p-2">{e.status === 'sucesso' ? <Link className="text-cyan-700 underline" href={`/api/agente-acordos/execucoes/${e.id}/pdf`} prefetch={false}>Baixar PDF</Link> : <span className="text-xs text-slate-500">{e.mensagem ?? (e.status === 'pendente' ? 'Aguardando agente' : '—')}</span>}</td></tr>)}</tbody></table></Card> : [...grupos].sort(([a], [b]) => (carteiras.get(a) ?? '').localeCompare(carteiras.get(b) ?? '')).map(([id, configs]) => <Card key={id} className="overflow-hidden p-0"><div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3"><div><p className="font-semibold">{carteiras.get(id) ?? 'Carteira'}</p><p className="text-xs text-slate-500">Manager · {configs.length} condomínio(s)</p></div><Badge tone="blue">Coleta de PDFs</Badge></div>{configs.sort((a, b) => (condos.get(a.condominio_id)?.nome ?? '').localeCompare(condos.get(b.condominio_id)?.nome ?? '')).map(c => {
      const e = ultima.get(c.condominio_id)
      const arquivo = pdf.get(c.condominio_id)
      const etapas = [{ nome: 'Solicitação', concluida: !!e, detalhe: e ? data(e.created_at) : 'Aguardando solicitação' }, { nome: 'Agente Manager', concluida: !!e?.iniciado_em, detalhe: e?.status === 'em_execucao' ? 'Consultando a administradora' : e?.iniciado_em ? data(e.iniciado_em) : 'Aguardando agente' }, { nome: 'PDF', concluida: e?.status === 'sucesso', detalhe: e?.status === 'sucesso' ? data(e.finalizado_em) : e?.status === 'falha' ? 'Resgate não concluído' : 'Aguardando documento' }]
      return <details key={c.condominio_id} className="group border-b border-slate-100 last:border-b-0"><summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4"><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{condos.get(c.condominio_id)?.nome}</p><p className="mt-1 text-xs text-slate-500">Manager · código {c.codigo_cliente} · último resgate {data(e?.finalizado_em)}</p></div><div className="hidden gap-1 sm:flex" aria-hidden="true">{etapas.map(etapa => <span key={etapa.nome} className={`h-1.5 w-9 rounded-full ${etapa.concluida ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}</div><Estado status={e?.status} /></summary><div className="space-y-3 px-4 pb-4 sm:pl-11"><div className="grid gap-3 md:grid-cols-3">{etapas.map((etapa, index) => <div key={etapa.nome} className={`rounded-lg border p-3 ${etapa.concluida ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}><p className="flex items-center gap-2 text-xs font-semibold">{etapa.concluida ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-slate-400">{index + 1}</span>}{etapa.nome}</p><p className="mt-2 text-xs text-slate-500">{etapa.detalhe}</p></div>)}</div>{e?.status === 'falha' && <p role="status" className="text-xs text-red-700">{e.mensagem ?? 'O resgate falhou. Tente novamente.'}</p>}<div className="flex flex-wrap items-start gap-3"><ResgatarPdfs ids={[c.condominio_id]} disabled={emFila(e)} />{arquivo && <ButtonLink size="sm" variant="secondary" prefetch={false} href={`/api/agente-acordos/execucoes/${arquivo.id}/pdf`}><Download className="h-3.5 w-3.5" />Baixar último PDF</ButtonLink>}</div></div></details>
    })}</Card>)}
  </div>
}
