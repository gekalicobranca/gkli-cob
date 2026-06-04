export type AgreementHealth = 'saudavel' | 'atencao' | 'critico'

const LABELS: Record<AgreementHealth, string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  critico: 'Crítico',
}

const CLASSES: Record<AgreementHealth, string> = {
  saudavel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  atencao: 'bg-amber-50 text-amber-700 ring-amber-200',
  critico: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function AgreementHealthBadge({ health }: { health?: AgreementHealth | string | null }) {
  const safeHealth = (health === 'critico' || health === 'atencao' || health === 'saudavel')
    ? health
    : 'saudavel'

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${CLASSES[safeHealth]}`}>
      {LABELS[safeHealth]}
    </span>
  )
}
