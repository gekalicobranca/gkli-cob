export type AgreementHealth = 'saudavel' | 'atencao' | 'critico' | 'nao_avaliado' | 'sem_abertas'

function civilDay(value?: string | null) {
  const text = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? date.getTime() : null
}

export function calculateAgreementHealth(parcelas: any[] = [], now = new Date()): {
  saude: AgreementHealth; vencidas: number; venceHoje: number; proximos7Dias: number
} {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const base = civilDay(today)!
  const abertas = (parcelas ?? []).filter(p => !p.data_pagamento && !['paga', 'pago', 'quitada', 'quitado', 'cancelada', 'cancelado'].includes(String(p.status ?? '').toLowerCase()))
  const dias = abertas.map(p => { const day = civilDay(p.vencimento); return day == null ? null : (day - base) / 86400000 })
  const vencidas = dias.filter(d => d != null && d < 0).length
  return {
    saude: vencidas >= 2 ? 'critico' : vencidas === 1 ? 'atencao'
      : !parcelas?.length || dias.includes(null) ? 'nao_avaliado'
      : !abertas.length ? 'sem_abertas' : 'saudavel',
    vencidas,
    venceHoje: dias.filter(d => d === 0).length,
    proximos7Dias: dias.filter(d => d != null && d >= 1 && d <= 7).length,
  }
}
