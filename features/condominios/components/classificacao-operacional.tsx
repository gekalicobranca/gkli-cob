const CLASSIFICACOES = [
  {
    value: 'ouro',
    label: 'Ouro',
    icon: '🥇',
    description: 'Relacionamento premium e maior cuidado operacional.',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
    selectedClass: 'peer-checked:border-amber-300 peer-checked:bg-amber-50 peer-checked:text-amber-900 peer-checked:ring-2 peer-checked:ring-amber-200',
  },
  {
    value: 'prata',
    label: 'Prata',
    icon: '🥈',
    description: 'Padrão operacional equilibrado.',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    selectedClass: 'peer-checked:border-slate-300 peer-checked:bg-slate-100 peer-checked:text-slate-950 peer-checked:ring-2 peer-checked:ring-slate-200',
  },
  {
    value: 'bronze',
    label: 'Bronze',
    icon: '🥉',
    description: 'Operação mais objetiva e intensiva.',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-800',
    selectedClass: 'peer-checked:border-orange-300 peer-checked:bg-orange-50 peer-checked:text-orange-900 peer-checked:ring-2 peer-checked:ring-orange-200',
  },
] as const

type ClassificacaoValue = (typeof CLASSIFICACOES)[number]['value']

function normalizeClassificacao(value?: string | null): ClassificacaoValue {
  return CLASSIFICACOES.some((item) => item.value === value) ? (value as ClassificacaoValue) : 'prata'
}

export function ClassificacaoOperacionalField({
  name = 'classificacao_operacional',
  defaultValue,
}: {
  name?: string
  defaultValue?: string | null
}) {
  const selected = normalizeClassificacao(defaultValue)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Classificação operacional</span>
        <span className="text-xs text-slate-400">Badge do condomínio</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {CLASSIFICACOES.map((item) => (
          <label key={item.value} className="block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={item.value}
              defaultChecked={selected === item.value}
              className="peer sr-only"
              required
            />
            <span
              className={`flex min-h-[92px] flex-col rounded-2xl border bg-white p-3 text-sm text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--gkli-primary)] hover:shadow-md ${item.selectedClass}`}
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </span>
              <span className="mt-2 text-xs leading-5 text-slate-500">{item.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function ClassificacaoOperacionalBadge({ value }: { value?: string | null }) {
  const normalized = normalizeClassificacao(value)
  const item = CLASSIFICACOES.find((option) => option.value === normalized) ?? CLASSIFICACOES[1]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${item.badgeClass}`}>
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </span>
  )
}
