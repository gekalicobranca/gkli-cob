import type { AgreementHealth } from '../health'
export type { AgreementHealth } from '../health'

const LABELS: Record<AgreementHealth, string> = {
  nao_avaliado: 'Não avaliado',
  sem_abertas: 'Sem parcelas abertas',
  saudavel: 'Em dia',
  atencao: 'Atenção',
  critico: 'Crítico',
}

const CLASSES: Record<AgreementHealth, string> = {
  nao_avaliado: 'bg-slate-50 text-slate-600 ring-slate-200',
  sem_abertas: 'bg-slate-50 text-slate-600 ring-slate-200',
  saudavel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  atencao: 'bg-amber-50 text-amber-700 ring-amber-200',
  critico: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function AgreementHealthBadge({ health }: { health?: AgreementHealth | string | null }) {
  const safeHealth = (health === 'critico' || health === 'atencao' || health === 'saudavel' || health === 'sem_abertas')
    ? health
    : 'nao_avaliado'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${CLASSES[safeHealth]}`}>
      {LABELS[safeHealth]}
    </span>
  )
}
