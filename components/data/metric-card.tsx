import { KpiCard } from '@/components/ui/kpi-card'

export function MetricCard({ label, title, value, description, hint }: { label?: string; title?: string; value: string | number; description?: string; hint?: string }) {
  return <KpiCard label={label ?? title ?? ''} value={value} hint={hint ?? description ?? ''} />
}
