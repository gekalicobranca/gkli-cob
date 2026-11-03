export type AgreementHealth = 'saudavel' | 'atencao' | 'critico' | 'nao_avaliado'

const LABELS: Record<AgreementHealth, string> = {
  nao_avaliado: 'Não avaliado',
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
}

const CLASSES: Record<AgreementHealth, string> = {
  nao_avaliado: 'bg-slate-50 text-slate-600 ring-slate-200',
  saudavel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  atencao: 'bg-amber-50 text-amber-700 ring-amber-200',
  critico: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function AgreementHealthBadge({ health }: { health?: AgreementHealth | string | null }) {
  const safeHealth = (health === 'critico' || health === 'atencao' || health === 'saudavel')
    ? health
    : 'nao_avaliado'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${CLASSES[safeHealth]}`}>
      {LABELS[safeHealth]}
    </span>
  )
}
