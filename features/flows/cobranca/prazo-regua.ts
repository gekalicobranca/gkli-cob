type PrazoCondominio = {
  dias_apos_vencimento_regua?: number | null
  inicio_cobranca_dias?: number | null
}

type CobrancaComPrazo = {
  vencimento?: string | null
  condominio?: PrazoCondominio | PrazoCondominio[] | null
}

const calendarioSaoPaulo = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})

function diaCivil(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp / 86_400_000 : NaN
}

/** Mesmo limite inclusivo do banco: hoje em São Paulo - vencimento >= D+ do condomínio. */
export function atingiuPrazoRegua(cobranca: CobrancaComPrazo, agora = new Date()) {
  const condominio = Array.isArray(cobranca.condominio) ? cobranca.condominio[0] : cobranca.condominio
  if (!condominio || !cobranca.vencimento || !Number.isFinite(agora.getTime())) return false
  const partes = calendarioSaoPaulo.formatToParts(agora)
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value
  const hoje = diaCivil(`${parte('year')}-${parte('month')}-${parte('day')}`)
  const dias = Math.max(0, condominio.dias_apos_vencimento_regua ?? condominio.inicio_cobranca_dias ?? 30)
  return hoje - diaCivil(cobranca.vencimento) >= dias
}

export function filtrarCobrancasNoPrazo<T extends CobrancaComPrazo>(rows: T[], agora = new Date()): T[] {
  return rows.filter(row => atingiuPrazoRegua(row, agora))
}
