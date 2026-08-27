'use client'

import { CheckCircle2, ChevronDown, ChevronRight, FileSignature } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PendingSubmitButton } from '@/components/ui/pending-submit-button'
import { ListEmptyState, ListPanel, ListPanelHeader, ListRow, ListRows, ListTitle } from '@/components/layout/list-page'
import { atualizarCertidaoPreJuridico, atualizarDistribuicaoPreJuridico, atualizarEtapaPreJuridico, atualizarProcuracaoPreJuridico, atualizarProcuracoesPreJuridicoEmMassa, confirmarJuridicoPreJuridico, confirmarJuridicoPreJuridicoEmMassa, gerarProcuracoesPreJuridico } from '@/features/pre-juridico/actions'
import { PRE_JURIDICO_ETAPAS, etapaPreJuridicoLabel, type PreJuridicoEtapa } from '@/features/pre-juridico/etapas'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

export function ProcessamentoEtapas({ casos, etapas }: { casos: any[]; etapas: readonly PreJuridicoEtapa[] }) {
  const [selectedProcuracoes, setSelectedProcuracoes] = useState<string[]>([])
  const [selectedConfirmacoes, setSelectedConfirmacoes] = useState<string[]>([])
  const toggleProcuracao = (id: string) => setSelectedProcuracoes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleTodasProcuracoes = (ids: string[], checked: boolean) => setSelectedProcuracoes((current) => checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id)))
  const toggleConfirmacao = (id: string) => setSelectedConfirmacoes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleTodasConfirmacoes = (ids: string[], checked: boolean) => setSelectedConfirmacoes((current) => checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id)))
  return <div className="space-y-3">
    {etapas.map((etapaId) => {
      const etapa = PRE_JURIDICO_ETAPAS.find((item) => item.id === etapaId)!
      const rows = casos.filter((caso) => caso.etapa === etapaId)
      const procuracaoIds = rows.map((caso) => String(caso.id))
      const selectedNaEtapa = etapaId === 'aguardando_sindico' ? rows.filter((caso) => selectedProcuracoes.includes(caso.id)) : []
      const todasSelecionadas = procuracaoIds.length > 0 && procuracaoIds.every((id) => selectedProcuracoes.includes(id))
      const confirmacaoIds = rows.map((caso) => String(caso.id))
      const selectedConfirmacoesNaEtapa = etapaId === 'confirmar_juridico' ? rows.filter((caso) => selectedConfirmacoes.includes(caso.id)) : []
      const todasConfirmacoesSelecionadas = confirmacaoIds.length > 0 && confirmacaoIds.every((id) => selectedConfirmacoes.includes(id))
      return <ListPanel key={etapaId}>
        <details open={rows.length > 0} className="group bg-white">
          <summary className="cursor-pointer list-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <ListPanelHeader className="flex items-center justify-between gap-4 bg-white/80 group-hover:bg-slate-50">
              <ListTitle title={etapa.label} description={descricaoEtapa(etapaId)} />
              <div className="flex shrink-0 items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{rows.length}</span><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></div>
            </ListPanelHeader>
          </summary>
          <div>
          {etapaId === 'aguardando_sindico' && rows.length ? <div className="border-b border-slate-100">
            <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-sm text-slate-600">Gere as procurações aqui; elas permanecem como Geradas no processamento e entram automaticamente na disponibilidade do Flow.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm">
                  <input type="checkbox" checked={todasSelecionadas} onChange={(event) => toggleTodasProcuracoes(procuracaoIds, event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Selecionar todas
                </label>
                <form action={gerarProcuracoesPreJuridico} target="_blank" onSubmit={(event) => { if (!window.confirm(`Gerar ${selectedNaEtapa.length} procuração(ões)?`)) event.preventDefault() }}>
                  {selectedNaEtapa.map((caso) => <input key={caso.id} type="hidden" name="caso_id" value={caso.id} />)}
                  <PendingSubmitButton disabled={!selectedNaEtapa.length} pendingLabel="Gerando procurações..."><FileSignature size={16} />Gerar procuração {selectedNaEtapa.length ? `(${selectedNaEtapa.length})` : ''}</PendingSubmitButton>
                </form>
              </div>
            </div>
            {selectedNaEtapa.length ? <form action={atualizarProcuracoesPreJuridicoEmMassa} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 md:grid-cols-[220px_1fr_auto] md:items-end" onSubmit={(event) => { if (!window.confirm(`Atualizar o andamento de ${selectedNaEtapa.length} procuração(ões)?`)) event.preventDefault() }}>
              {selectedNaEtapa.map((caso) => <input key={caso.id} type="hidden" name="caso_id" value={caso.id} />)}
              <Field label="Alterar selecionadas para"><select name="procuracao_status" defaultValue="gerada" className={controlClass}><option value="pendente">Pendente</option><option value="gerada">Gerada</option><option value="enviada">Enviada</option><option value="assinada">Assinada</option></select></Field>
              <Field label="Observação em massa"><input name="observacoes" className={controlClass} /></Field>
              <PendingSubmitButton pendingLabel="Atualizando..."><CheckCircle2 size={16} />Salvar em massa ({selectedNaEtapa.length})</PendingSubmitButton>
              <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Assinada, os casos selecionados avançam automaticamente para Confirmar jurídico.</p>
            </form> : null}
          </div> : null}
          {etapaId === 'confirmar_juridico' && rows.length ? <div className="border-b border-slate-100">
            <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <p className="text-sm text-slate-600">Selecione casos para aplicar as confirmações jurídicas em massa.</p>
              <label className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm">
                <input type="checkbox" checked={todasConfirmacoesSelecionadas} onChange={(event) => toggleTodasConfirmacoes(confirmacaoIds, event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Selecionar todas
              </label>
            </div>
            {selectedConfirmacoesNaEtapa.length ? <form action={confirmarJuridicoPreJuridicoEmMassa} className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 xl:flex-row xl:items-center xl:justify-between" onSubmit={(event) => { if (!window.confirm(`Salvar confirmações em ${selectedConfirmacoesNaEtapa.length} caso(s)?`)) event.preventDefault() }}>
              {selectedConfirmacoesNaEtapa.map((caso) => <input key={caso.id} type="hidden" name="caso_id" value={caso.id} />)}
              <div className="flex flex-wrap gap-2">
                <InlineCheckbox name="juridico_procuracao_assinada_confirmada" label="Procuração" defaultChecked />
                <InlineCheckbox name="juridico_registro_recebido" label="Registro" defaultChecked />
                <InlineCheckbox name="juridico_laudo_enviado" label="Laudo" defaultChecked />
              </div>
              <PendingSubmitButton pendingLabel="Salvando..."><CheckCircle2 size={16} />Salvar em massa ({selectedConfirmacoesNaEtapa.length})</PendingSubmitButton>
            </form> : null}
          </div> : null}
          {rows.length ? <ListRows>{rows.map((caso) => <CasoProcessamento key={caso.id} caso={caso} selectable={etapaId === 'aguardando_sindico' || etapaId === 'confirmar_juridico'} selectionLabel={etapaId === 'confirmar_juridico' ? 'Selecionar confirmação jurídica' : 'Selecionar procuração'} selected={etapaId === 'confirmar_juridico' ? selectedConfirmacoes.includes(caso.id) : selectedProcuracoes.includes(caso.id)} onToggle={etapaId === 'confirmar_juridico' ? () => toggleConfirmacao(caso.id) : () => toggleProcuracao(caso.id)} />)}</ListRows> : <ListEmptyState title="Nenhum caso nesta etapa" description="Não há processamentos neste painel para os filtros selecionados." />}
          </div>
        </details>
      </ListPanel>
    })}
  </div>
}

function CasoProcessamento({ caso, selectable = false, selectionLabel = 'Selecionar caso', selected = false, onToggle }: { caso: any; selectable?: boolean; selectionLabel?: string; selected?: boolean; onToggle?: () => void }) {
  const condominio = relation(caso.condominio)
  const unidade = relation(caso.unidade)
  const cobrancasUnidade = Array.isArray(caso.cobrancas_unidade) ? caso.cobrancas_unidade : []

  if (caso.etapa === 'confirmar_juridico') return <ConfirmarJuridicoInlineRow caso={caso} condominio={condominio} unidade={unidade} cobrancasUnidade={cobrancasUnidade} selectable={selectable} selectionLabel={selectionLabel} selected={selected} onToggle={onToggle} />

  const acordo = relation(caso.acordo)
  const cobranca = relation(caso.cobranca)
  const responsavel = relation(caso.responsavel)
  const valor = acordo?.valor_acordado != null
    ? Number(acordo.valor_acordado)
    : cobrancasUnidade.length
      ? cobrancasUnidade.reduce((sum: number, item: any) => sum + Number(item.valor_atualizado ?? item.valor_original ?? 0), 0)
      : Number(cobranca?.valor_atualizado ?? cobranca?.valor_original ?? 0)

  return <details className="group/caso">
    <summary className="list-none [&::-webkit-details-marker]:hidden"><ListRow className={`cursor-pointer bg-white ${selectable ? 'md:grid-cols-[28px_minmax(260px,1fr)_150px_150px_150px_24px]' : 'md:grid-cols-[minmax(260px,1fr)_150px_150px_150px_24px]'}`}>
      {selectable ? <input aria-label={selectionLabel} type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" /> : null}
      <div><p className="text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p><p className="mt-1 text-xs text-slate-500">{unidade?.responsavel_nome || 'Responsável não informado'} · {cobrancasUnidade.length || 1} cobrança(s) agrupada(s){caso.etapa === 'pronto_juridico' ? ` · ${caso.distribuicao_status === 'distribuido' ? 'Ação judicial registrada' : 'Aguardando CNJ'}` : ''}</p></div>
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
      <Field label="Andamento da procuração"><select name="procuracao_status" defaultValue={caso.procuracao_status ?? 'pendente'} className={controlClass}><option value="pendente">Pendente</option><option value="gerada">Gerada</option><option value="enviada">Enviada</option><option value="assinada">Assinada</option></select></Field>
      <Field label="Observação"><input name="observacoes" defaultValue={caso.observacoes ?? ''} className={controlClass} /></Field>
      <PendingSubmitButton pendingLabel="Atualizando...">Salvar andamento</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-3">Ao marcar como Assinada, o caso avançará automaticamente para Confirmar jurídico.</p>
    </form> : caso.etapa === 'pronto_juridico' ? <form action={atualizarDistribuicaoPreJuridico} className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end" onSubmit={(event) => { if (!window.confirm('Confirmar a distribuição e marcar ação judicial para a unidade?')) event.preventDefault() }}>
      <input type="hidden" name="caso_id" value={caso.id} />
      <Field label="Número CNJ"><input name="distribuicao_cnj" defaultValue={formatCnj(caso.distribuicao_cnj)} disabled={caso.distribuicao_status === 'distribuido'} placeholder="0000000-00.0000.0.00.0000" className={controlClass} /></Field>
      <PendingSubmitButton disabled={caso.distribuicao_status === 'distribuido'} pendingLabel="Confirmando...">{caso.distribuicao_status === 'distribuido' ? 'Ação judicial registrada' : 'Confirmar ação judicial'}</PendingSubmitButton>
      <p className="text-xs text-slate-500 md:col-span-2">Ao confirmar o CNJ, a unidade receberá o flag de ação judicial e as cobranças abertas serão judicializadas.</p>
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

function ConfirmarJuridicoInlineRow({ caso, condominio, unidade, cobrancasUnidade, selectable = false, selectionLabel = 'Selecionar caso', selected = false, onToggle }: { caso: any; condominio: any; unidade: any; cobrancasUnidade: any[]; selectable?: boolean; selectionLabel?: string; selected?: boolean; onToggle?: () => void }) {
  return <form action={confirmarJuridicoPreJuridico} className={`grid gap-3 bg-white px-4 py-3 transition hover:bg-slate-50 md:items-center ${selectable ? 'md:grid-cols-[28px_minmax(320px,1fr)_130px_110px_100px_auto]' : 'md:grid-cols-[minmax(320px,1fr)_130px_110px_100px_auto]'}`}>
    <input type="hidden" name="caso_id" value={caso.id} />
    {selectable ? <input aria-label={selectionLabel} type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" /> : null}
    <div>
      <p className="text-sm font-semibold text-slate-950">{condominio?.nome_operacional || condominio?.nome || 'Condomínio'} · Unidade {unidade?.identificacao || '-'}</p>
      <p className="mt-1 text-xs text-slate-500">{cobrancasUnidade.length || 1} cobrança(s) agrupada(s)</p>
    </div>
    <InlineCheckbox name="juridico_procuracao_assinada_confirmada" label="Procuração" defaultChecked={Boolean(caso.juridico_procuracao_assinada_confirmada || caso.procuracao_status === 'assinada')} />
    <InlineCheckbox name="juridico_registro_recebido" label="Registro" defaultChecked={Boolean(caso.juridico_registro_recebido)} />
    <InlineCheckbox name="juridico_laudo_enviado" label="Laudo" defaultChecked={Boolean(caso.juridico_laudo_enviado)} />
    <PendingSubmitButton size="sm" pendingLabel="Salvando...">Salvar</PendingSubmitButton>
  </form>
}

function InlineCheckbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/40">
    <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600" />
    {label}
  </label>
}

const controlClass = 'mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs font-medium text-slate-600">{label}{children}</label>
}

function formatCnj(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length !== 20) return String(value ?? '')
  return digits.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6')
}

function descricaoEtapa(etapa: PreJuridicoEtapa) {
  if (etapa === 'aguardando_documentos') return 'Solicite a certidão e confirme a propriedade antes de avançar.'
  if (etapa === 'aguardando_sindico') return 'Geração, envio e confirmação da procuração assinada pelo síndico.'
  if (etapa === 'confirmar_juridico') return 'Confirme procuração assinada, registro recebido e laudo enviado.'
  if (etapa === 'pronto_juridico') return 'Informe o número CNJ para confirmar a distribuição e marcar ação judicial.'
  return etapaPreJuridicoLabel(etapa)
}
