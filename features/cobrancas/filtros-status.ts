import { COBRANCA_STATUS_OPERACIONAL as STATUS } from '@/lib/constants/cobrancas'

export const STATUS_BLOQUEIOS = [STATUS.POSSIVEL_ACORDO, STATUS.ACORDO_FIRMADO, STATUS.ACORDO_EFETIVADO, STATUS.PRE_JURIDICO, STATUS.JUDICIALIZADO, STATUS.SUSPENSO]
export const STATUS_OPERACIONAIS = [STATUS.NOVO, STATUS.EM_COBRANCA_ATIVA, STATUS.EM_NEGOCIACAO]
const STATUS_FILA = STATUS_OPERACIONAIS

export function resolveFiltrosStatus(statusParam = '', bloqueioParam = '') {
  const statusLegado = STATUS_BLOQUEIOS.includes(statusParam as any)
  const bloqueio = ['nao', 'todos', 'sim', 'bloqueados', ...STATUS_BLOQUEIOS].includes(bloqueioParam)
    ? bloqueioParam
    : statusLegado ? statusParam : 'nao'
  const somenteBloqueios = bloqueio === 'sim' || bloqueio === 'bloqueados' || STATUS_BLOQUEIOS.includes(bloqueio as any)
  const statusSelect = somenteBloqueios || statusLegado ? 'todos'
    : statusParam === 'todos' || STATUS_OPERACIONAIS.includes(statusParam as any) ? statusParam
    : bloqueio === 'todos' ? 'todos' : 'operacionais'
  return {
    status: statusSelect === 'todos' || statusSelect === 'operacionais' ? '' : statusSelect,
    statusList: statusSelect === 'operacionais' ? STATUS_FILA : undefined,
    statusSelect,
    showingAll: statusSelect === 'todos',
    judicializacaoUnidade: bloqueio,
  }
}

// Use os dois campos para impedir que um status legado divergente libere um bloqueio.
export function applyBloqueioStatusFilter(query: any, bloqueio: string) {
  const statuses = STATUS_BLOQUEIOS.join(',')
  if (bloqueio === 'nao') {
    return query.or(`status_operacional.is.null,status_operacional.not.in.(${statuses})`)
      .or(`status.is.null,status.not.in.(${statuses})`)
  }
  if (bloqueio === 'bloqueados') return query.or(`status_operacional.in.(${statuses}),status.in.(${statuses})`)
  if (STATUS_BLOQUEIOS.includes(bloqueio as any)) return query.or(`status_operacional.eq.${bloqueio},status.eq.${bloqueio}`)
  return query
}
