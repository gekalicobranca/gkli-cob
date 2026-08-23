'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { atualizarEtapaPreJuridico } from '@/features/pre-juridico/actions'
import { PRE_JURIDICO_ETAPAS, etapaPreJuridicoLabel, type PreJuridicoEtapa } from '@/features/pre-juridico/etapas'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

const tones: Record<string, string> = {
  aguardando_documentos: 'border-slate-200 bg-slate-50/70',
  aguardando_sindico: 'border-orange-200 bg-orange-50/60',
  aguardando_administradora: 'border-amber-200 bg-amber-50/60',
  pronto_juridico: 'border-emerald-200 bg-emerald-50/60',
}
const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function ProcessamentoEtapas({ casos, etapas }: { casos: any[]; etapas: readonly PreJuridicoEtapa[] }) {
  return <div className="space-y-3">
    {etapas.map((etapaId, index) => {
      const etapa = PRE_JURIDICO_ETAPAS.find((item) => item.id === etapaId)!
      const rows = casos.filter((caso) => caso.etapa === etapaId)
      return <details key={etapaId} open={index === 0 || rows.length > 0} className={`group overflow-hidden rounded-2xl border ${tones[etapaId] ?? 'border-slate-200 bg-white'}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3"><ChevronDown size={18} className="shrink-0 text-slate-500 transition group-open:rotate-180" /><div><h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-slate-800">{etapa.label}</h2><p className="mt-1 text-xs text-slate-500">{descricaoEtapa(etapaId)}</p></div></div>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">{rows.length}</span>
        </summary>
        <div className="border-t border-current/10 bg-white/80">
          {rows.length ? <div className="divide-y divide-slate-100">{rows.map((caso) => <CasoProcessamento key={caso.id} caso={caso} />)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhum caso nesta etapa.</p>}
        </div>
      </details>
    })}
  </div>
}

function CasoProcessamento({ caso }: { caso: any }) {
  const condominio = relation(caso.condominio)
  const unidade = relation(caso.unidade)
  const acordo = relation(caso.acordo)
  const cobranca = relation(caso.cobranca)
  const responsavel = relation(caso.responsavel)
  const valor = Number(acordo?.valor_acordado ?? cobranca?.valor_atualizado ?? cobranca?.valor_original ?? 0)

  return <details className="group/caso">
    <summary className="grid cursor-pointer list-none gap-3 px-5 py-3 hover:bg-white md:grid-cols-[minmax(260px,1fr)_150px_150px_150px_24px] md:items-center [&::-webkit-details-marker]:hidden">
      <div><p className="text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'}</p></div>
      <div><p className="text-xs text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(valor)}</p></div>
      <div><p className="text-xs text-slate-400">Responsável interno</p><p className="mt-1 text-sm">{responsavel?.nome || 'Não definido'}</p></div>
      <div><p className="text-xs text-slate-400">Atualização</p><p className="mt-1 text-sm">{formatDateBR(caso.updated_at)}</p></div>
      <ChevronRight size={17} className="text-slate-400 transition group-open/caso:rotate-90" />
    </summary>
    <form action={atualizarEtapaPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { if (!window.confirm('Confirmar a atualização deste caso?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Nova etapa"><select name="etapa" defaultValue={caso.etapa} className={controlClass}>{PRE_JURIDICO_ETAPAS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>
      <Field label="Escritório jurídico"><input name="escritorio_juridico" defaultValue={caso.escritorio_juridico ?? ''} className={controlClass} /></Field>
      <Field label="Prazo da etapa"><input name="prazo_etapa" type="date" defaultValue={caso.prazo_etapa ?? ''} className={controlClass} /></Field>
      <Field label="Protocolo de envio"><input name="protocolo_envio" defaultValue={caso.protocolo_envio ?? ''} className={controlClass} /></Field>
      <Field label="Número do processo"><input name="numero_processo" defaultValue={caso.numero_processo ?? ''} placeholder="Obrigatório ao judicializar" className={controlClass} /></Field>
      <Field label="Tribunal"><input name="tribunal" defaultValue={caso.tribunal ?? ''} className={controlClass} /></Field>
      <Field label="Foro"><input name="foro" defaultValue={caso.foro ?? ''} className={controlClass} /></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} className={controlClass} /></Field>
      <div className="md:col-span-2 xl:col-span-4 flex justify-end"><PendingSubmitButton pendingLabel="Atualizando...">Salvar etapa</PendingSubmitButton></div>
    </form>
  </details>
}

const controlClass = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs font-medium text-slate-600">{label}{children}</label>
}

function descricaoEtapa(etapa: PreJuridicoEtapa) {
  if (etapa === 'aguardando_documentos') return 'Conferência e preparação dos documentos do caso.'
  if (etapa === 'aguardando_sindico') return 'Envio e confirmação da procuração assinada pelo síndico.'
  if (etapa === 'aguardando_administradora') return 'Validação da administradora após a assinatura do síndico.'
  if (etapa === 'pronto_juridico') return 'Pacote revisado e pronto para envio ao jurídico.'
  return etapaPreJuridicoLabel(etapa)
}
