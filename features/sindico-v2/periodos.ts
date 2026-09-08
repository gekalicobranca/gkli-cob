export const PORTAL_TIME_ZONE = 'America/Sao_Paulo'

export type PeriodoSindico = {
  modo: 'mensal' | 'anual'
  competencia: string
  ano: number
  inicio: string
  fimExclusivo: string
  competencias: string[]
  titulo: string
}

function chave(ano: number, mes: number) {
  const date = new Date(Date.UTC(ano, mes - 1, 10))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ultimaCompetenciaFechada(agora = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PORTAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora)
  const valor = (tipo: string) => Number(parts.find((part) => part.type === tipo)?.value)
  return chave(valor('year'), valor('month') - (valor('day') < 10 ? 1 : 0))
}

export function tituloCompetencia(competencia: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${competencia}-10T12:00:00Z`))
}

export function resolverPeriodo(
  params: { modo?: string; competencia?: string; ano?: string },
  agora = new Date(),
): PeriodoSindico {
  const ultima = ultimaCompetenciaFechada(agora)
  const anoMaximo = Number(ultima.slice(0, 4))
  if (params.modo === 'anual') {
    const solicitado = /^\d{4}$/.test(params.ano ?? '') ? Number(params.ano) : anoMaximo
    const ano = solicitado >= 1900 && solicitado <= anoMaximo ? solicitado : anoMaximo
    const ultimoMes = ano === anoMaximo ? Number(ultima.slice(5)) : 12
    const competencias = Array.from({ length: ultimoMes }, (_, index) => chave(ano, index + 1))
    return {
      modo: 'anual', ano, competencia: competencias[competencias.length - 1], competencias,
      inicio: `${chave(ano, 0)}-10`, fimExclusivo: `${chave(ano, ultimoMes)}-10`,
      titulo: `Consolidado de ${ano}`,
    }
  }
  const solicitado = params.competencia ?? ''
  const competencia = /^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(solicitado) && solicitado <= ultima
    ? solicitado : ultima
  const [ano, mes] = competencia.split('-').map(Number)
  return {
    modo: 'mensal', ano, competencia, competencias: [competencia],
    inicio: `${chave(ano, mes - 1)}-10`, fimExclusivo: `${competencia}-10`,
    titulo: tituloCompetencia(competencia),
  }
}

export function formatarDataCiclo(data: string) {
  return data.split('-').reverse().join('/')
}
