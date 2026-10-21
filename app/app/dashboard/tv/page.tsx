'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { getTvClosingResults } from '@/features/dashboard/tv-actions'
import { formatCurrency } from '@/utils/formatters/currency'

type Results = Awaited<ReturnType<typeof getTvClosingResults>>
const dateLabel = (date: string) => date.split('-').reverse().join('/')

export default function TvDashboard() {
  const [periodId, setPeriodId] = useState('')
  const [data, setData] = useState<Results | null>(null)
  const [error, setError] = useState('')
  const [clock, setClock] = useState('')
  const [slideId, setSlideId] = useState('general')
  const [playing, setPlaying] = useState(true)
  const slideIds = data?.slides?.map(slide => slide.id).join(',') ?? ''

  useEffect(() => {
    if (!playing || !slideIds) return
    const ids = slideIds.split(',')
    if (ids.length < 2) return
    const timer = setInterval(() => setSlideId(current => ids[(Math.max(0, ids.indexOf(current)) + 1) % ids.length]), 20000)
    return () => clearInterval(timer)
  }, [playing, slideIds])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const result = await getTvClosingResults(periodId)
        if (!cancelled) { setData(result); setError('') }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha na atualização. Tentando novamente em 30 segundos.')
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 30000)
      }
    }
    setData(null)
    void refresh()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [periodId])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { setError('O navegador não permitiu tela cheia. Use F11.') }
  }
  const number = (value: number) => value.toLocaleString('pt-BR')
  const activeSlide = data?.slides?.find(slide => slide.id === slideId) ?? data?.slides?.[0]
  const metrics = activeSlide?.metrics
  const walletSlide = activeSlide && activeSlide.id !== 'general'
  const groups = data && metrics ? [
    {
      title: 'Captação', subtitle: 'Valores disponíveis para cobrar', tone: 'text-sky-300', border: 'border-sky-300/20', background: 'from-sky-400/10',
      cards: [
        { label: 'Unidades para cobrar', value: number(metrics.capture.units), detail: 'Unidades únicas com saldo disponível' },
        { label: 'Inadimplência para cobrar', value: formatCurrency(metrics.capture.value), detail: `Saldo cobrável até ${dateLabel(metrics.capture.cutoff)}, incluindo anteriores` },
      ],
    },
    {
      title: 'Acordos', subtitle: 'Conversão em compromissos', tone: 'text-violet-300', border: 'border-violet-300/20', background: 'from-violet-400/10',
      cards: [
        { label: 'Realizados no período', value: number(metrics.agreements.period), detail: formatCurrency(metrics.agreements.periodValue) + ' acordados' },
        { label: 'Realizados no dia', value: number(metrics.agreements.today), detail: `${dateLabel(data.today)} · ${formatCurrency(metrics.agreements.todayValue)}` },
        { label: 'Totais vigentes', value: number(metrics.agreements.current), detail: 'Ativos, em dia e em atraso · todas as datas' },
      ],
    },
    {
      title: 'Resultado', subtitle: 'Previsão e realização do fechamento', tone: 'text-teal-300', border: 'border-teal-300/20', background: 'from-teal-400/10',
      cards: [
        { label: 'Parcelas previstas no período', value: number(metrics.result.expected), detail: formatCurrency(metrics.result.expectedValue) + ' com vencimento no período' },
        { label: 'Parcelas pagas no período', value: number(metrics.result.paid), detail: formatCurrency(metrics.result.paidValue) + ' pela data de pagamento' },
        { label: 'Repasse previsto', value: formatCurrency(metrics.result.transfer), detail: 'Despesa de cobrança das parcelas previstas' },
      ],
    },
  ] : []
  return (
    <main className="min-h-screen border-t-[6px] bg-[#07131f] px-[3vw] py-[3vh] text-slate-100 transition-colors duration-700" style={{ borderColor: activeSlide?.color ?? '#2dd4bf', backgroundImage: walletSlide ? `radial-gradient(ellipse at top left, ${activeSlide.color}55, transparent 75%)` : undefined }}>
      <header className="flex flex-wrap items-center justify-between gap-6 border-b border-white/10 pb-[3vh]">
        <div className="flex items-center gap-[1.5vw]">
          <Image src="/logo-gkit-app-icon.png" alt="GKLI APP" width={112} height={112} preload className="h-[clamp(64px,6vw,112px)] w-[clamp(64px,6vw,112px)] shrink-0 rounded-2xl" />
          <div><p className="text-sm font-semibold tracking-[.35em] text-teal-300" style={walletSlide ? { color: activeSlide.foreground } : undefined}>GKLI APP / RESULTADOS</p><h1 className="mt-2 text-[clamp(28px,3vw,64px)] font-semibold tracking-tight">{walletSlide ? activeSlide.name : 'Cada resultado conta.'}</h1></div>
        </div>
        <div className="text-right"><p className="font-mono text-[clamp(26px,3vw,64px)] tabular-nums">{clock || '—'}</p><p className={`text-sm ${error ? 'text-amber-300' : 'text-teal-300'}`}>{error ? '● Atualização pendente' : data ? '● Atualização automática · 30s' : 'Carregando resultados…'}</p></div>
      </header>
      <div className="my-[3vh] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="tv-closing" className="text-slate-400">Período do fechamento</label>
          <select id="tv-closing" value={periodId} onChange={event => setPeriodId(event.target.value)} className="max-w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 [color-scheme:dark]">
            <option value="">Fechamento atual · automático</option>
            {data?.periods.map(item => <option key={item.id} value={item.id}>{dateLabel(item.data_abertura)} a {dateLabel(item.data_fechamento)}</option>)}
          </select>
          {data && <span className="font-medium text-teal-300">{dateLabel(data.start)} a {dateLabel(data.end)}</span>}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-300"><Link href="/app/dashboard">Voltar</Link><button onClick={toggleFullscreen} className="rounded-lg border border-white/20 px-4 py-2">Tela cheia ↗</button></div>
      </div>
      {data && activeSlide && <nav aria-label="Slides por carteira" className="mb-[2vh] flex flex-wrap items-center gap-3 text-sm">
        <span aria-hidden="true" className="h-5 w-5 rounded-full border border-white/25" style={{ backgroundColor: activeSlide.color }} />
        <label htmlFor="tv-wallet" className="text-slate-400">Carteira</label>
        <select id="tv-wallet" value={activeSlide.id} onChange={event => setSlideId(event.target.value)} className="max-w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 [color-scheme:dark]">
          {data.slides.map((slide, index) => <option key={slide.id} value={slide.id}>{index + 1}. {slide.name}</option>)}
        </select>
        <button type="button" aria-pressed={!playing} onClick={() => setPlaying(current => !current)} className="rounded-lg border border-white/20 px-4 py-2">{playing ? 'Pausar slides' : 'Retomar slides'}</button>
        <span className="text-slate-400">Slide {data.slides.findIndex(slide => slide.id === activeSlide.id) + 1}/{data.slides.length} · {playing ? 'Troca automática · 20s' : 'Pausado'}</span>
      </nav>}
      {error && <p role="alert" className="mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-amber-200">{error} {data && 'Exibindo a última consulta bem-sucedida.'}</p>}
      {!data && <p role="status" className="py-20 text-center text-2xl text-slate-400">{error ? 'Aguardando uma consulta válida.' : 'Consultando os resultados do período…'}</p>}
      {data && <>
        <div className="grid gap-[1.5vw] lg:grid-cols-3">
          {groups.map((group, index) => (
            <section key={group.title} aria-label={group.title} style={walletSlide ? { borderColor: `${activeSlide.color}b3`, backgroundImage: `linear-gradient(to bottom, ${activeSlide.color}40, transparent)` } : undefined} className={`flex flex-col rounded-2xl border bg-gradient-to-b ${group.border} ${group.background} to-transparent p-[clamp(18px,1.6vw,36px)]`}>
              <header className="mb-[2vh] border-b border-white/10 pb-[2vh]">
                <p style={walletSlide ? { color: activeSlide.foreground } : undefined} className={`text-xs font-medium tracking-[.25em] ${group.tone}`}>0{index + 1} / GKLI</p>
                <h2 style={walletSlide ? { color: activeSlide.foreground } : undefined} className={`mt-2 text-[clamp(26px,2.2vw,48px)] font-semibold uppercase tracking-wide ${group.tone}`}>{group.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{group.subtitle}</p>
              </header>
              <div className="grid flex-1 auto-rows-fr divide-y divide-white/10">
                {group.cards.map(card => (
                  <article key={card.label} className="flex min-h-[15vh] flex-col justify-center py-[2vh]">
                    <h3 className="text-[clamp(15px,1.15vw,25px)] text-slate-200">{card.label}</h3>
                    <p style={walletSlide ? { color: activeSlide.foreground } : undefined} className={`my-[1vh] break-words text-[clamp(30px,2.7vw,60px)] font-semibold tracking-tight tabular-nums ${group.tone}`}>{card.value}</p>
                    <p className="text-[clamp(12px,.85vw,18px)] text-slate-400">{card.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="mt-[3vh] flex flex-wrap justify-between gap-3 text-sm text-slate-400"><p>Fonte: base operacional GKLI · Cobranças, acordos e parcelas · Carteiras permitidas</p><p>Última consulta: {new Date(data.updatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Brasília</p></footer>
      </>}
    </main>
  )
}
