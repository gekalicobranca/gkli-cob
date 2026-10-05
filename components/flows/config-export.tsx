'use client'

import { useState } from 'react'

const labels: Record<string, string> = { carteiras: 'Carteiras', templates: 'Templates', reguas: 'Réguas', etapas: 'Etapas',
  smtp_configs: 'SMTPs', whatsapp_cloud_configs: 'WhatsApp Cloud', whatsapp_web_configs: 'WhatsApp Web',
  worker_configs: 'Workers/configurações', processing_configs: 'Processamento e retry' }

export function FlowConfigExport() {
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function prepare() {
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/flows/config-export', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Falha ao preparar exportação.')
      setResult(json)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na exportação.') }
    finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(result.generated_at))
    link.download = `gkli-flow-config-export-${date}.json`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="space-y-6 p-6">
    <h1 className="text-2xl font-semibold">Exportar configuração para GKLI-FLOW</h1>
    <p>Exporta templates, réguas, etapas, canais e regras de processamento. Senhas devem ser cadastradas e sessões WhatsApp Web pareadas novamente no GKLI-FLOW.</p>
    <button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={prepare}>{busy ? 'Lendo configurações…' : 'Preparar exportação e validar'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <section className="space-y-4" aria-live="polite">
      <h2 className="text-xl font-semibold">Resumo da exportação</h2>
      <ul>{Object.entries(result.validation.counts).map(([key, count]) => <li key={key}>{labels[key] ?? key}: {String(count)}</li>)}</ul>
      <h2 className="font-semibold">Problemas encontrados ({result.validation.warnings.length})</h2>
      {result.validation.warnings.length ? <ul>{result.validation.warnings.map((warning: string, i: number) => <li key={i}>{warning}</li>)}</ul> : <p>Nenhum problema de referência encontrado.</p>}
      {result.validation.notes.map((note: string) => <p key={note} className="text-sm">{note}</p>)}
      <button className="rounded bg-blue-700 px-4 py-2 text-white" onClick={download}>Baixar JSON</button>
    </section>}
  </main>
}
