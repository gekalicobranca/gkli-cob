import { Bot, CheckCircle2, FolderInput, FolderOutput, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

function formatarData(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}

export default async function CaptacaoAutomatizadaPage() {
  const supabase = createAdminClient()
  const { data: execucoes } = await supabase.from('conversoes_relatorio')
    .select('id, nome_arquivo, status, total_cobrancas, total_parcelas, inconsistencias_json, criado_em, atualizado_em')
    .eq('origem', 'captacao_automatizada:bbz').order('criado_em', { ascending: false }).limit(12)

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute right-8 top-0 h-48 w-48 rounded-full bg-[#04799a]/35 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#d7eef5] ring-1 ring-white/15"><Bot size={22} /></span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d7eef5]">Configurações · Lab</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Captação automatizada</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Piloto BBZ para o Clock Vila Romana. O agente coleta o XLS; esta rotina converte, concilia, aplica a régua e importa sem intervenção do operador.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><FolderInput className="text-[#04799a]" size={22} /><p className="mt-4 text-sm font-semibold text-slate-950">1. Pasta de entrada</p><p className="mt-2 text-sm leading-6 text-slate-500">Monitora a pasta Downloads e aceita somente arquivos CLOCK_VILA_ROMANA_*.xls.</p></Card>
        <Card className="p-5"><ShieldCheck className="text-[#04799a]" size={22} /><p className="mt-4 text-sm font-semibold text-slate-950">2. Conversão e importação</p><p className="mt-2 text-sm leading-6 text-slate-500">Evita duplicidades, sinaliza divergências e mantém fora da régua no histórico.</p></Card>
        <Card className="p-5"><FolderOutput className="text-[#04799a]" size={22} /><p className="mt-4 text-sm font-semibold text-slate-950">3. Arquivamento</p><p className="mt-2 text-sm leading-6 text-slate-500">Move para Downloads/processados; em erro, preserva em Downloads/falhas.</p></Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-semibold text-slate-950">Histórico automático</h2><p className="mt-1 text-xs text-slate-500">Últimas conversões executadas pelo piloto</p></div>
          <span className="flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 size={15} /> Fluxo isolado</span>
        </div>
        <div className="divide-y divide-slate-100">
          {execucoes?.length ? execucoes.map((item: any) => {
            const alertas = Array.isArray(item.inconsistencias_json) ? item.inconsistencias_json.length : 0
            return <div key={item.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div><p className="text-sm font-medium text-slate-950">{item.nome_arquivo || 'Relatório sem nome'}</p><p className="mt-1 text-xs text-slate-500">{formatarData(item.atualizado_em || item.criado_em)} · {item.total_cobrancas ?? 0} cobranças · {item.total_parcelas ?? 0} parcelas</p></div>
              <div className="flex items-center gap-3">{alertas > 0 && <span className="flex items-center gap-1 text-xs text-amber-700"><TriangleAlert size={14} />{alertas} alerta(s)</span>}<StatusBadge status={item.status} /></div>
            </div>
          }) : <div className="px-5 py-10 text-center text-sm text-slate-500">Nenhum arquivo processado automaticamente ainda.</div>}
        </div>
      </Card>
    </div>
  )
}
