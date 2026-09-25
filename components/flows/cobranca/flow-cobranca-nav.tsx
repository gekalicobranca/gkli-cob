import { Bot, History, ListChecks, Plus, Wrench } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { flowCobrancaPath, flowCobrancaTabQuery, type CanalFlowCobranca, type FlowCobrancaAba } from '@/features/flows/cobranca/rotas'

export function FlowCobrancaNav({ canal, aba, query }: { canal: CanalFlowCobranca; aba: FlowCobrancaAba; query: string }) {
  const tabs: Array<{ id: FlowCobrancaAba; label: string; icon: typeof Bot }> = [
    { id: 'flows', label: 'Acompanhar', icon: ListChecks },
    { id: 'gerar', label: 'Gerar flows', icon: Plus },
    { id: 'saneamento', label: 'Saneamento', icon: Wrench },
    { id: 'historico', label: 'Histórico', icon: History },
    ...(canal === 'email' ? [{ id: 'maestro' as const, label: 'Maestro', icon: Bot }] : []),
  ]
  return <nav aria-label="Áreas dos flows de cobrança" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
    {tabs.map(({ id, label, icon: Icon }) => {
      const params = flowCobrancaTabQuery(query, aba, id)
      return <ButtonLink key={id} href={`${flowCobrancaPath(canal)}?${params}`} prefetch={false} variant={aba === id ? 'primary' : 'ghost'} aria-current={aba === id ? 'page' : undefined}><Icon size={16} />{label}</ButtonLink>
    })}
  </nav>
}
