'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { atualizarEtapaPreJuridico } from '@/features/pre-juridico/actions'
import { PRE_JURIDICO_ETAPAS, etapaPreJuridicoLabel, type PreJuridicoEtapa } from '@/features/pre-juridico/etapas'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function ProcessamentoEtapas({ casos, etapas }: { casos: any[]; etapas: readonly PreJuridicoEtapa[] }) {
  return <div className="space-y-3">
    {etapas.map((etapaId) => {
      const etapa = PRE_JURIDICO_ETAPAS.find((item) => item.id === etapaId)!
      const rows = casos.filter((caso) => caso.etapa === etapaId)
      return <ListPanel key={etapaId}>
        <details open={rows.length > 0} className="group bg-white">
          <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
              <ListTitle title={etapa.label} description={descricaoEtapa(etapaId)} />
              <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{rows.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
            </ListPanelHeader>
          </summary>
          <div>
          {rows.length ? <ListRows>{rows.map((caso) => <CasoProcessamento key={caso.id} caso={caso} />)}</ListRows> : <ListEmptyState title="Nenhum caso nesta etapa" description="Não há processamentos neste painel para os filtros selecionados." />}
          </div>
        </details>
      </ListPanel>
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
    <summary className="list-none [&::-webkit-details-marker]:hidden"><ListRow className="cursor-pointer bg-white md:grid-cols-[minmax(260px,1fr)_150px_150px_150px_24px]">
      <div><p className="text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'}</p></div>
      <div><p className="text-xs text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(valor)}</p></div>
      <div><p className="text-xs text-slate-400">Responsável interno</p><p className="mt-1 text-sm">{responsavel?.nome || 'Não definido'}</p></div>
      <div><p className="text-xs text-slate-400">Atualização</p><p className="mt-1 text-sm">{formatDateBR(caso.updated_at)}</p></div>
      <ChevronRight size={17} className="text-slate-400 transition group-open/caso:rotate-90" />
    </ListRow></summary>
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
