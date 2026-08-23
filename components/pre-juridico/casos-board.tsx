'use client'

import { useState } from 'react'
import { CalendarClock, ChevronRight, Scale, UserRound } from 'lucide-react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { atualizarEtapaPreJuridico } from '@/features/pre-juridico/actions'
import { PRE_JURIDICO_ETAPAS, etapaPreJuridicoLabel, type PreJuridicoEtapa } from '@/features/pre-juridico/etapas'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

const tones: Record<string, string> = {
  aguardando_documentos: 'border-slate-200 bg-slate-50', confirmar_juridico: 'border-amber-200 bg-amber-50/60',
  aguardando_sindico: 'border-orange-200 bg-orange-50/60', pronto_juridico: 'border-emerald-200 bg-emerald-50/60',
  enviado_juridico: 'border-sky-200 bg-sky-50/60', analise_juridica: 'border-blue-200 bg-blue-50/60',
  pendencia_juridica: 'border-rose-200 bg-rose-50/60', autorizado_ajuizamento: 'border-violet-200 bg-violet-50/60', judicializado: 'border-slate-300 bg-slate-100',
}
const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function PreJuridicoCasosBoard({ casos, etapas = PRE_JURIDICO_ETAPAS.map((item) => item.id) }: { casos: any[]; etapas?: readonly PreJuridicoEtapa[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const visibleStages = PRE_JURIDICO_ETAPAS.filter((item) => etapas.includes(item.id))
  return <div className="overflow-x-auto pb-3"><div className="grid gap-3" style={{ minWidth: `${Math.max(visibleStages.length, 1) * 310}px`, gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, minmax(300px, 1fr))` }} aria-label="Fluxo dos casos pré-jurídicos">
    {visibleStages.map((etapa) => {
      const rows = casos.filter((caso) => caso.etapa === etapa.id)
      return <section key={etapa.id} className={`min-h-[360px] rounded-2xl border p-2.5 ${tones[etapa.id]}`} aria-labelledby={`etapa-${etapa.id}`}>
        <header className="flex items-center justify-between gap-2 px-1 py-2"><h2 id={`etapa-${etapa.id}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-700">{etapa.shortLabel}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 shadow-sm">{rows.length}</span></header>
        <div className="space-y-2">{rows.map((caso) => {
          const condominio = relation(caso.condominio), unidade = relation(caso.unidade), acordo = relation(caso.acordo), cobranca = relation(caso.cobranca), responsavel = relation(caso.responsavel)
          const open = expanded === caso.id
          return <article key={caso.id} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'}</p><p className="mt-0.5 text-xs text-slate-500">Unidade {unidade?.identificacao || '-'}</p></div><Scale size={15} className="shrink-0 text-slate-400" /></div>
            <p className="mt-3 text-sm font-semibold text-slate-900">{formatCurrency(Number(acordo?.valor_acordado ?? cobranca?.valor_atualizado ?? cobranca?.valor_original ?? 0))}</p>
            <div className="mt-2 space-y-1 text-[11px] text-slate-500"><p className="flex items-center gap-1.5"><UserRound size={12} />{responsavel?.nome || 'Sem responsável definido'}</p><p className="flex items-center gap-1.5"><CalendarClock size={12} />Atualizado em {formatDateBR(caso.updated_at)}</p></div>
            {caso.numero_processo ? <p className="mt-2 rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-medium text-slate-700">Processo {caso.numero_processo}</p> : null}
            {caso.prazo_etapa ? <p className="mt-2 text-[11px] font-medium text-slate-600">Prazo: {formatDateBR(caso.prazo_etapa)}</p> : null}
            <button type="button" onClick={() => setExpanded(open ? null : caso.id)} className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-[var(--gkli-primary)]" aria-expanded={open}>Atualizar etapa <ChevronRight size={14} className={open ? 'rotate-90 transition' : 'transition'} /></button>
            {open ? <form action={atualizarEtapaPreJuridico} className="mt-3 space-y-2" onSubmit={(event) => { if (!window.confirm('Confirmar a atualização deste caso?')) event.preventDefault() }}>
              <input type="hidden" name="caso_id" value={caso.id} />
              <label className="block text-[11px] font-medium text-slate-600">Nova etapa<select name="etapa" defaultValue={caso.etapa} className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs">{PRE_JURIDICO_ETAPAS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
              <label className="block text-[11px] font-medium text-slate-600">Escritório jurídico<input name="escritorio_juridico" defaultValue={caso.escritorio_juridico ?? ''} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Prazo da etapa<input name="prazo_etapa" type="date" defaultValue={caso.prazo_etapa ?? ''} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Protocolo de envio<input name="protocolo_envio" defaultValue={caso.protocolo_envio ?? ''} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Número do processo<input name="numero_processo" defaultValue={caso.numero_processo ?? ''} placeholder="Obrigatório ao judicializar" className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Tribunal<input name="tribunal" defaultValue={caso.tribunal ?? ''} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Foro<input name="foro" defaultValue={caso.foro ?? ''} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
              <label className="block text-[11px] font-medium text-slate-600">Observação<textarea name="observacoes" defaultValue={caso.observacoes ?? ''} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs" /></label>
              <PendingSubmitButton size="sm" className="w-full" pendingLabel="Atualizando...">Salvar etapa</PendingSubmitButton>
            </form> : null}
          </article>
        })}{!rows.length ? <div className="rounded-xl border border-dashed border-slate-300/80 px-3 py-8 text-center text-xs text-slate-400">Nenhum caso em {etapaPreJuridicoLabel(etapa.id).toLowerCase()}</div> : null}</div>
      </section>
    })}
  </div></div>
}
