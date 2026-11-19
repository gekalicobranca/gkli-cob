'use client'

import { useMemo, useState } from 'react'
import { Building2, CalendarDays, CircleDollarSign, FileText, Home, Landmark } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MoneyForm } from '@/components/ui/money-form'
import { createCobranca } from '@/features/cobrancas/actions'

type Choice = { id: string; nome: string; carteira_id?: string; identificacao?: string; bloco?: string | null; responsavel_nome?: string | null; condominio_id?: string }

const fieldClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/10'
const money = (value: string) => {
  if (!value.trim()) return '—'
  const amount = Number(value.replaceAll('.', '').replace(',', '.'))
  return Number.isFinite(amount) ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
}

export function ManualCobrancaForm({ carteiras, condominios, unidades }: { carteiras: Choice[]; condominios: Choice[]; unidades: Choice[] }) {
  const [carteiraId, setCarteiraId] = useState('')
  const [condominioId, setCondominioId] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [valorOriginal, setValorOriginal] = useState('')
  const [valorAtualizado, setValorAtualizado] = useState('')
  const condominiosFiltrados = useMemo(() => condominios.filter(item => item.carteira_id === carteiraId), [condominios, carteiraId])
  const unidadesFiltradas = useMemo(() => unidades.filter(item => item.condominio_id === condominioId && item.carteira_id === carteiraId), [unidades, condominioId, carteiraId])

  return <MoneyForm action={createCobranca} fields={[{ name: 'valor_original', label: 'Valor original' }, { name: 'valor_atualizado', label: 'Valor atualizado', optional: true }]} className="space-y-5">
    <Card className="overflow-hidden border-slate-200 p-0">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-sky-100 p-2 text-sky-800"><Landmark size={18}/></div><div><h2 className="text-sm font-semibold text-slate-950">Identificação do débito</h2><p className="mt-0.5 text-xs text-slate-500">Escolha a carteira e a cobrança será vinculada às opções correspondentes.</p></div></div></div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <FormField label="1. Carteira"><select className={fieldClass} name="carteira_id" required value={carteiraId} onChange={e => {setCarteiraId(e.target.value);setCondominioId('');setUnidadeId('')}}><option value="">Selecione a carteira</option>{carteiras.map(item=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></FormField>
        <FormField label="2. Condomínio"><select className={fieldClass} name="condominio_id" required disabled={!carteiraId} value={condominioId} onChange={e=>{setCondominioId(e.target.value);setUnidadeId('')}}><option value="">{carteiraId ? 'Selecione o condomínio' : 'Escolha uma carteira primeiro'}</option>{condominiosFiltrados.map(item=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></FormField>
        <FormField label="3. Unidade"><select className={fieldClass} name="unidade_id" required disabled={!condominioId} value={unidadeId} onChange={e=>setUnidadeId(e.target.value)}><option value="">{condominioId ? 'Selecione a unidade' : 'Escolha um condomínio primeiro'}</option>{unidadesFiltradas.map(item=><option key={item.id} value={item.id}>{item.identificacao}{item.bloco ? ` · Bloco ${item.bloco}` : ''} · {item.responsavel_nome || 'Sem responsável'}</option>)}</select></FormField>
        <FormField label="Competência" hint="Referência do débito, no formato AAAA-MM."><Input name="competencia" placeholder="Ex.: 2026-05" pattern="[0-9]{4}-(0[1-9]|1[0-2])" /></FormField>
      </div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <Card className="space-y-5">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-800"><CircleDollarSign size={18}/></div><div><h2 className="text-sm font-semibold text-slate-950">Valores e vencimento</h2><p className="mt-0.5 text-xs text-slate-500">O valor atualizado pode incluir encargos até a data de cadastro.</p></div></div>
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Valor original"><Input name="valor_original" required inputMode="decimal" placeholder="0,00" value={valorOriginal} onChange={e=>setValorOriginal(e.target.value)} /></FormField>
          <FormField label="Valor atualizado" hint="Se deixar em branco, será usado o valor original."><Input name="valor_atualizado" inputMode="decimal" placeholder="Igual ao valor original" value={valorAtualizado} onChange={e=>setValorAtualizado(e.target.value)} /></FormField>
          <FormField label="Data de vencimento"><Input name="vencimento" type="date" required className={fieldClass}/></FormField>
        </div>
        <FormField label="Observações" hint="Informações internas para identificar a origem do lançamento."><Textarea name="observacoes" placeholder="Ex.: recibo, histórico ou detalhe do débito" className="min-h-24 rounded-xl" /></FormField>
      </Card>
      <Card className="h-fit space-y-4 border-sky-200 bg-sky-50/50">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-white p-2 text-sky-800 shadow-sm"><FileText size={18}/></div><div><h2 className="text-sm font-semibold text-slate-950">Resumo</h2><p className="text-xs text-slate-500">Confira antes de salvar.</p></div></div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"><div className="flex items-start gap-2 text-slate-600"><Building2 size={16} className="mt-0.5 shrink-0"/><span>{condominios.find(item=>item.id===condominioId)?.nome || 'Condomínio não selecionado'}</span></div><div className="flex items-start gap-2 text-slate-600"><Home size={16} className="mt-0.5 shrink-0"/><span>{unidadesFiltradas.find(item=>item.id===unidadeId)?.identificacao || 'Unidade não selecionada'}</span></div><div className="flex items-center gap-2 text-slate-600"><CalendarDays size={16}/><span>Competência e vencimento serão registrados no cadastro</span></div><div className="border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Valor original</p><p className="font-semibold text-slate-950">{money(valorOriginal)}</p><p className="mt-2 text-xs text-slate-500">Valor atualizado</p><p className="font-semibold text-slate-950">{money(valorAtualizado || valorOriginal)}</p></div></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row xl:flex-col-reverse"><ButtonLink href="/app/cobrancas" variant="secondary" className="w-full">Cancelar</ButtonLink><Button type="submit" className="w-full">Salvar cobrança</Button></div>
      </Card>
    </div>
  </MoneyForm>
}
