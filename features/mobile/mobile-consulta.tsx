'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, CircleDollarSign, Handshake, Landmark, RefreshCw, SlidersHorizontal, Smartphone } from 'lucide-react'
import { mobileQuery, periodoMobileValido, type MobileSelection, type MobileView } from './consulta'

type Option = { id: string; nome: string }
type Parcela = { id: string; numero: number; valor: number; vencimento: string; pagamento: string; dataPagamento: string | null; repasse: number | null }
type Item = { id: string; condominio: string; carteira: string; unidade: string; bloco: string; responsavel: string; valor: number; vencimento?: string; status: string; processo?: string; parcelas?: Parcela[] }
type Data = { items?: Item[]; total?: number; page?: number; pages?: number; valor?: number; acordos?: number; metrics?: { expected: number; expectedValue: number; paid: number; paidValue: number; transfer: number }; updatedAt?: string }
const cards = [
  { id: 'cobrancas', title: 'Cobranças', note: 'Cotas e valores em cobrança', icon: CircleDollarSign, color: 'bg-[#086c89]' },
  { id: 'extrajudiciais', title: 'Acordos extrajudiciais', note: 'Parcelas, pagamentos e repasses', icon: Handshake, color: 'bg-[#6035a0]' },
  { id: 'judiciais', title: 'Acordos judiciais', note: 'Processos e parcelas dos acordos', icon: Landmark, color: 'bg-[#244ba1]' },
  { id: 'resultados', title: 'Resultados', note: 'Repasses do período', icon: Building2, color: 'bg-[#08795d]' },
] as const
const money = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const date = (v: string) => v?.slice(0, 10).split('-').reverse().join('/') || '—'
const label = (v: string) => (v || 'Não informado').replaceAll('_', ' ')
const inputClass = 'min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900'

export function MobileConsulta({ userId, carteiras, condominios, initialPeriod }: {
  userId: string; carteiras: Option[]; condominios: (Option & { carteiraId: string })[]; initialPeriod: { inicio: string; fim: string }
}) {
  const defaults: MobileSelection = { modo: 'carteira', carteiraId: '', condominioId: '', ...initialPeriod }
  const [selection, setSelection] = useState<MobileSelection | null>(null)
  const [draft, setDraft] = useState(defaults)
  const [editing, setEditing] = useState(true)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<MobileView | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const storageKey = `gkli:mobile:consulta:v1:${userId}`
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as MobileSelection | null
      if (saved && ['carteira', 'condominio'].includes(saved.modo) && periodoMobileValido(saved.inicio, saved.fim) &&
        (saved.modo === 'carteira' ? (!saved.carteiraId || carteiras.some(c => c.id === saved.carteiraId)) : condominios.some(c => c.id === saved.condominioId))) {
        setSelection(saved); setDraft(saved); setEditing(false)
      }
    } catch { /* Sem armazenamento disponível: seleção funciona durante a sessão. */ }
    setReady(true)
  }, [storageKey, carteiras, condominios])
  useEffect(() => {
    if (!view || !selection) return
    const controller = new AbortController()
    setData(null); setLoading(true); setError('')
    fetch(`/api/mobile/consulta?${mobileQuery(selection, view, page)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar a consulta.')
        return body
      }).then(body => { if (!controller.signal.aborted) setData(body) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || 'Falha na consulta.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selection, view, page, revision])
  function apply(event: React.FormEvent) {
    event.preventDefault()
    if (!periodoMobileValido(draft.inicio, draft.fim)) { setFormError('Informe um período válido de até 366 dias.'); return }
    if (draft.modo === 'condominio' && !draft.condominioId) { setFormError('Selecione um condomínio.'); return }
    setSelection(draft); setEditing(false); setView(null); setPage(1); setFormError('')
    try { localStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* Preferência mantida em memória. */ }
  }
  function open(next: MobileView) { setView(next); setPage(1); setError('') }
  const selectedName = selection?.modo === 'condominio' ? condominios.find(c => c.id === selection.condominioId)?.nome : carteiras.find(c => c.id === selection?.carteiraId)?.nome || 'Todas as carteiras'
  const active = cards.find(c => c.id === view)
  return <main className="min-h-dvh bg-slate-100 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="flex items-center gap-3"><Image src="/logo-gkli-menu-icon.png" width={44} height={44} alt="GKLI" /><div><p className="text-xl font-bold">GKLI Mobile</p><p className="text-xs text-slate-500">Consulta · versão preliminar</p></div></div>
        <Link href="/app/inbox" className="rounded-xl border border-slate-200 px-3 py-3 text-sm">Desktop</Link>
      </div>
    </header>
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-12 pt-5">
      {!ready ? <p role="status">Carregando suas preferências…</p> : <>
        {selection && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultando</p><p className="mt-1 break-words text-lg font-bold">{selectedName}</p><p className="mt-1 text-sm text-slate-600">{date(selection.inicio)} a {date(selection.fim)}</p></div><button type="button" onClick={() => { setDraft(selection); setEditing(!editing) }} aria-expanded={editing} className="flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-semibold"><SlidersHorizontal size={18} />Alterar</button></div>
        </section>}
        {editing && <form onSubmit={apply} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><h1 className="text-2xl font-bold">O que vamos consultar?</h1><p className="mt-2 text-sm text-slate-600">Escolha a seleção e o período. Vamos lembrar deles neste aparelho.</p></div>
          <fieldset><legend className="mb-2 text-sm font-semibold">Consultar por</legend><div className="flex gap-2">{(['carteira', 'condominio'] as const).map(mode => <label key={mode} className={`flex min-h-14 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 font-semibold ${draft.modo === mode ? 'border-cyan-700 bg-cyan-50 text-cyan-900' : 'border-slate-200'}`}><input type="radio" name="modo" value={mode} checked={draft.modo === mode} onChange={() => setDraft({ ...draft, modo: mode })} />{mode === 'carteira' ? 'Carteira' : 'Condomínio'}</label>)}</div></fieldset>
          {draft.modo === 'carteira' ? <label className="block space-y-2 text-sm font-semibold"><span>Carteira</span><select className={inputClass} value={draft.carteiraId} onChange={e => setDraft({ ...draft, carteiraId: e.target.value })}><option value="">Todas as carteiras</option>{carteiras.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label> : <div className="space-y-2"><label htmlFor="mobile-busca" className="block text-sm font-semibold">Condomínio</label><input id="mobile-busca" className={inputClass} type="search" placeholder="Buscar condomínio…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Selecione o condomínio" required className={inputClass} value={draft.condominioId} onChange={e => setDraft({ ...draft, condominioId: e.target.value })}><option value="">Selecione</option>{condominios.filter(c => c.id === draft.condominioId || c.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>}
          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><label className="block space-y-2 text-sm font-semibold"><span>Vencimento de</span><input required type="date" className={inputClass} value={draft.inicio} onChange={e => setDraft({ ...draft, inicio: e.target.value })} /></label><label className="block space-y-2 text-sm font-semibold"><span>Até</span><input required type="date" className={inputClass} value={draft.fim} onChange={e => setDraft({ ...draft, fim: e.target.value })} /></label></div>
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
          <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 text-lg font-semibold text-white" type="submit">Continuar <ArrowRight size={20} /></button>
        </form>}
        {selection && !editing && <>
          {!view ? <section><h1 className="mb-4 text-2xl font-bold">Suas consultas</h1><div className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">{cards.map(card => <button type="button" key={card.id} onClick={() => open(card.id)} className={`${card.color} flex min-h-44 flex-col items-start rounded-3xl p-5 text-left text-white shadow-lg active:scale-[.98]`}><card.icon size={32} aria-hidden="true" /><span className="mt-5 text-xl font-bold leading-tight">{card.title}</span><span className="mt-2 text-sm text-white/90">{card.note}</span></button>)}</div><p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Smartphone size={16} />Seleção salva para as próximas consultas.</p></section> : <section className="space-y-4">
            <div className="flex items-center justify-between gap-2"><button type="button" onClick={() => setView(null)} className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-semibold"><ArrowLeft size={18} />Menu</button><button aria-label="Atualizar consulta" type="button" onClick={() => setRevision(n => n + 1)} className="min-h-12 rounded-xl bg-white px-4"><RefreshCw size={20} /></button></div>
            <h1 className="text-2xl font-bold">{active?.title}</h1><p className="text-sm text-slate-600">{view === 'cobrancas' ? 'Cobranças operacionais com vencimento no período.' : view === 'resultados' ? 'Resultados extrajudiciais com os mesmos critérios da TV. Repasse previsto não confirma recebimento.' : 'Acordos com parcelas vencendo no período, incluindo quitados. O status de cada acordo permanece identificado.'}</p>
            {loading && <p role="status" className="rounded-2xl bg-white p-6">Consultando dados…</p>}
            {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4"><p>{error}</p><button type="button" onClick={() => setRevision(n => n + 1)} className="mt-3 min-h-12 rounded-xl bg-white px-4 font-semibold">Tentar novamente</button></div>}
            {!loading && !error && data && <>
              {data.metrics ? <div className="space-y-3">{[
                ['Repasse previsto no período', money(data.metrics.transfer)], ['Acordos válidos', String(data.acordos)], ['Parcelas previstas', `${data.metrics.expected} · ${money(data.metrics.expectedValue)}`], ['Parcelas pagas no período', `${data.metrics.paid} · ${money(data.metrics.paidValue)}`],
              ].map(([title, value], i) => <article key={title} className={`rounded-2xl p-5 ${i === 0 ? 'bg-emerald-800 text-white' : 'border border-slate-200 bg-white'}`}><h2 className="text-sm">{title}</h2><p className="mt-2 break-words text-3xl font-bold">{value}</p></article>)}<p className="text-xs text-slate-500">Parcelas previstas: por vencimento. Pagas: pela data de pagamento. Atualizado em {new Date(data.updatedAt!).toLocaleString('pt-BR')}.</p></div> : <>
                <p className="rounded-2xl bg-white p-4 font-semibold">{data.total} {view === 'cobrancas' ? 'cotas' : 'acordos'}{data.valor != null && <span className="mt-1 block text-xl">{money(data.valor)}</span>}</p>
                {!data.items?.length && <p className="rounded-2xl bg-white p-5">Nenhum registro para esta seleção e período.</p>}
                {data.items?.map(item => <article key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-xs text-slate-500">{item.carteira}</p><h2 className="mt-1 break-words text-lg font-bold">{item.condominio}</h2><p className="mt-2 font-semibold">Unidade {item.unidade || '—'}{item.bloco ? ` · Bloco ${item.bloco}` : ''}</p><p className="mt-1 break-words text-sm text-slate-600">{item.responsavel || 'Responsável não informado'}</p></div><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-sm capitalize">{label(item.status)}</span><p className="text-xl font-bold">{money(item.valor)}</p></div>{item.vencimento && <p className="text-sm">Vencimento: {date(item.vencimento)}</p>}{item.processo && <p className="break-all text-sm text-slate-600">Processo: {item.processo}</p>}{item.parcelas && <details open className="border-t border-slate-100 pt-3"><summary className="cursor-pointer py-2 font-semibold">Parcelas do período ({item.parcelas.length})</summary><div className="divide-y divide-slate-100">{item.parcelas.map(parcela => <div key={parcela.id} className="space-y-2 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>#{parcela.numero} · {date(parcela.vencimento)}</span><strong>{money(parcela.valor)}</strong></div><p className={parcela.pagamento === 'Paga' ? 'font-semibold text-emerald-700' : 'text-slate-600'}>{parcela.pagamento}{parcela.dataPagamento ? ` em ${date(parcela.dataPagamento)}` : ''}</p><p>Repasse previsto: <strong>{parcela.repasse == null ? 'Não informado' : money(parcela.repasse)}</strong></p></div>)}</div></details>}</article>)}
                {!!data.total && <nav aria-label="Páginas da consulta" className="flex items-center justify-between gap-2"><button type="button" disabled={page <= 1} onClick={() => { setPage(n => n - 1); window.scrollTo({ top: 0 }) }} className="min-h-12 rounded-xl bg-white px-4 disabled:opacity-40">Anterior</button><span className="text-sm">{page} / {data.pages}</span><button type="button" disabled={page >= (data.pages || 1)} onClick={() => { setPage(n => n + 1); window.scrollTo({ top: 0 }) }} className="min-h-12 rounded-xl bg-white px-4 disabled:opacity-40">Próxima</button></nav>}
              </>}
            </>}
          </section>}
        </>}
      </>}
    </div>
  </main>
}
