'use client'

import { useState } from 'react'
import { Download, FileText, LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function RelatorioRanking({ id, detalhado, atualizadoEm }: { id: string; detalhado: boolean; atualizadoEm?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const router = useRouter(); const href = `/api/captacao-automatizada/conversoes/${id}/relatorio`
  async function gerar(form?: HTMLFormElement) {
    setBusy(true); setError(''); setSuccess('')
    try {
      const response = await fetch(href, form ? { method: 'POST', body: new FormData(form) } : undefined)
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Não foi possível gerar o PDF.') }
      const blob = await response.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'relatorio-inadimplencia.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      if (form) { form.reset(); router.refresh() }
      setSuccess(form ? 'Fontes salvas. Relatório atualizado e baixado.' : 'Relatório baixado.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.') }
    finally { setBusy(false) }
  }
  return <div className="w-full space-y-3 md:max-w-md">
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => gerar()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileText size={16} />}Baixar relatório PDF</button>
      <a href={`/api/captacao-automatizada/conversoes/${id}/ranking`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"><Download size={16} />Planilha do ranking</a>
    </div>
    <p className="text-xs text-slate-500">{detalhado ? 'Análise por natureza, faixa de atraso e processos informados.' : 'Base resumida. Anexe a origem para detalhar naturezas e faixas de atraso.'}{atualizadoEm ? ` Fontes atualizadas em ${new Date(atualizadoEm).toLocaleDateString('pt-BR')}.` : ''}</p>
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Atualizar fontes do relatório</summary>
      <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void gerar(e.currentTarget) }}>
        <p className="text-xs text-slate-500">As fontes ficam salvas para os próximos downloads deste ranking. Envie somente os arquivos que deseja atualizar.</p>
        {[['original', 'Relatório original de inadimplência'], ['processos', 'Relação de processos deste condomínio'], ['preJuridico', 'Controle de pré-jurídico']].map(([name, label]) => <label key={name} className="block text-xs text-slate-600">{label}<input type="file" name={name} accept=".xls,.xlsx" disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-xs" /></label>)}
        <label className="block text-xs text-slate-600">Data-base financeira (opcional)<input type="date" name="dataBase" disabled={busy} className="mt-1 block rounded-lg border border-slate-200 p-2" /></label>
        <button type="submit" disabled={busy} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Gerando relatório…' : 'Salvar fontes e gerar PDF'}</button>
      </form>
    </details>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {success ? <p role="status" className="text-sm text-green-700">{success}</p> : null}
  </div>
}
