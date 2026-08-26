'use client'

import Link from 'next/link'
import { ChevronDown, ChevronRight, FileSignature, PackagePlus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { atualizarCertidaoPreJuridico, atualizarDistribuicaoPreJuridico, atualizarEtapaPreJuridico, atualizarProcuracaoPreJuridico, confirmarJuridicoPreJuridico, gerarProcuracoesPreJuridico } from '@/features/pre-juridico/actions'
import { PRE_JURIDICO_ETAPAS, etapaPreJuridicoLabel, type PreJuridicoEtapa } from '@/features/pre-juridico/etapas'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function ProcessamentoEtapas({ casos, etapas }: { casos: any[]; etapas: readonly PreJuridicoEtapa[] }) {
  const [selectedProcuracoes, setSelectedProcuracoes] = useState<string[]>([])
  const toggleProcuracao = (id: string) => setSelectedProcuracoes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
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
          {etapaId === 'aguardando_sindico' && rows.length ? <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between"><p className="text-sm text-slate-600">Gere as procurações aqui; depois monte lote, régua e disparo na tela Flow.</p><div className="flex flex-wrap gap-2"><form action={gerarProcuracoesPreJuridico} target="_blank" onSubmit={(event) => { if (!window.confirm(`Gerar ${selectedProcuracoes.length} procuração(ões)?`)) event.preventDefault() }}>{selectedProcuracoes.map((id) => <input key={id} type="hidden" name="caso_id" value={id} />)}<PendingSubmitButton disabled={!selectedProcuracoes.length} pendingLabel="Gerando procurações..."><FileSignature size={16} />Gerar procuração {selectedProcuracoes.length ? `(${selectedProcuracoes.length})` : ''}</PendingSubmitButton></form><Link href="/app/pre-juridico/flow" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"><PackagePlus size={16} />Montar Flow</Link></div></div> : null}
          {rows.length ? <ListRows>{rows.map((caso) => { const gerarDisponivel = caso.procuracao_status !== 'gerada' && caso.procuracao_status !== 'assinada'; return <CasoProcessamento key={caso.id} caso={caso} selectable={etapaId === 'aguardando_sindico' && gerarDisponivel} selectionLabel="Selecionar para gerar procuração" selected={selectedProcuracoes.includes(caso.id)} onToggle={() => toggleProcuracao(caso.id)} /> })}</ListRows> : <ListEmptyState title="Nenhum caso nesta etapa" description="Não há processamentos neste painel para os filtros selecionados." />}
          </div>
        </details>
      </ListPanel>
    })}
  </div>
}

function CasoProcessamento({ caso, selectable = false, selectionLabel = 'Selecionar caso', selected = false, onToggle }: { caso: any; selectable?: boolean; selectionLabel?: string; selected?: boolean; onToggle?: () => void }) {
  const condominio = relation(caso.condominio)
  const unidade = relation(caso.unidade)
  const acordo = relation(caso.acordo)
  const cobranca = relation(caso.cobranca)
  const responsavel = relation(caso.responsavel)
  const cobrancasUnidade = Array.isArray(caso.cobrancas_unidade) ? caso.cobrancas_unidade : []
  const valor = acordo?.valor_acordado != null
    ? Number(acordo.valor_acordado)
    : cobrancasUnidade.length
      ? cobrancasUnidade.reduce((sum: number, item: any) => sum + Number(item.valor_atualizado ?? item.valor_original ?? 0), 0)
      : Number(cobranca?.valor_atualizado ?? cobranca?.valor_original ?? 0)

  return <details className="group/caso">
    <summary className="list-none [&::-webkit-details-marker]:hidden"><ListRow className={`cursor-pointer bg-white ${selectable ? 'md:grid-cols-[28px_minmax(260px,1fr)_150px_150px_150px_24px]' : 'md:grid-cols-[minmax(260px,1fr)_150px_150px_150px_24px]'}`}>
      {selectable ? <input aria-label={selectionLabel} type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" /> : null}
      <div><p className="text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'} · {cobrancasUnidade.length || 1} cobrança(s) agrupada(s){caso.etapa === 'pronto_juridico' ? ` · ${caso.distribuicao_status === 'distribuido' ? 'Distribuído' : 'Solicitado'}` : ''}</p></div>
      <div><p className="text-xs text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold">{formatCurrency(valor)}</p></div>
      <div><p className="text-xs text-slate-400">Responsável interno</p><p className="mt-1 text-sm">{responsavel?.nome || 'Não definido'}</p></div>
      <div><p className="text-xs text-slate-400">Atualização</p><p className="mt-1 text-sm">{formatDateBR(caso.updated_at)}</p></div>
      <ChevronRight size={17} className="text-slate-400 transition group-open/caso:rotate-90" />
    </ListRow></summary>
    {caso.etapa === 'aguardando_documentos' ? <form action={atualizarCertidaoPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-end" onSubmit={(event) => { if (!window.confirm('Confirmar o andamento da certidão?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Andamento da certidão"><select name="certidao_status" defaultValue={caso.certidao_status ?? 'pendente'} className={controlClass}><option value="pendente">Pendente</option><option value="solicitada">Solicitada</option><option value="recebida">Recebida</option></select></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} className={controlClass} /></Field>
      <PendingSubmitButton pendingLabel="Atualizando...">Salvar andamento</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Recebida, o caso avançará automaticamente para Procuração.</p>
    </form> : caso.etapa === 'aguardando_sindico' ? <form action={atualizarProcuracaoPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-end" onSubmit={(event) => { if (!window.confirm('Confirmar o andamento da procuração?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Andamento da procuração"><select name="procuracao_status" defaultValue={caso.procuracao_status ?? 'pendente'} className={controlClass}><option value="pendente">Pendente</option><option value="gerada">Gerada</option><option value="assinada">Assinada</option></select></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} className={controlClass} /></Field>
      <PendingSubmitButton pendingLabel="Atualizando...">Salvar andamento</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Assinada, o caso avançará automaticamente para Confirmar jurídico.</p>
    </form> : caso.etapa === 'confirmar_juridico' ? <form action={confirmarJuridicoPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-end" onSubmit={(event) => { if (!window.confirm('Confirmar o retorno do jurídico?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Confirmação do jurídico"><select name="confirmacao_juridico" defaultValue="pendente" className={controlClass}><option value="pendente">Pendente</option><option value="pronto">Pronto</option></select></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} className={controlClass} /></Field>
      <PendingSubmitButton pendingLabel="Confirmando...">Salvar confirmação</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Pronto, o caso entrará automaticamente em Distribuição com status Solicitado.</p>
    </form> : caso.etapa === 'pronto_juridico' ? <form action={atualizarDistribuicaoPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[220px_1fr_auto] md:items-end" onSubmit={(event) => { if (!window.confirm('Confirmar o andamento da distribuição?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Andamento da distribuição"><select name="distribuicao_status" defaultValue={caso.distribuicao_status ?? 'solicitado'} disabled={caso.distribuicao_status === 'distribuido'} className={controlClass}><option value="solicitado">Solicitado</option><option value="distribuido">Distribuído</option></select></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} disabled={caso.distribuicao_status === 'distribuido'} className={controlClass} /></Field>
      <PendingSubmitButton disabled={caso.distribuicao_status === 'distribuido'} pendingLabel="Atualizando...">{caso.distribuicao_status === 'distribuido' ? 'Distribuído' : 'Salvar andamento'}</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Distribuído, todas as cobranças abertas da unidade serão judicializadas e a unidade ficará marcada com ação judicial.</p>
    </form> : <form action={atualizarEtapaPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { if (!window.confirm('Confirmar a atualização deste caso?')) event.preventDefault() }}>
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
    </form>}
  </details>
}

const controlClass = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs font-medium text-slate-600">{label}{children}</label>
}

function descricaoEtapa(etapa: PreJuridicoEtapa) {
  if (etapa === 'aguardando_documentos') return 'Solicite a certidão e confirme a propriedade antes de avançar.'
  if (etapa === 'aguardando_sindico') return 'Geração, envio e confirmação da procuração assinada pelo síndico.'
  if (etapa === 'confirmar_juridico') return 'Confirmação do recebimento e aceite do caso pelo jurídico.'
  if (etapa === 'pronto_juridico') return 'Distribuição solicitada ao jurídico, aguardando confirmação.'
  return etapaPreJuridicoLabel(etapa)
}
