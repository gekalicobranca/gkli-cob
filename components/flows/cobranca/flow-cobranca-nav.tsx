import { Bot, History, ListChecks, Plus, Wrench } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { flowCobrancaPath, type CanalFlowCobranca, type FlowCobrancaAba } from '@/features/flows/cobranca/rotas'

export function FlowCobrancaNav({ canal, aba, query }: { canal: CanalFlowCobranca; aba: FlowCobrancaAba; query: string }) {
  const tabs = [
    { id: 'flows', label: 'Acompanhar', icon: ListChecks },
    { id: 'gerar', label: 'Gerar flows', icon: Plus },
    { id: 'saneamento', label: 'Saneamento', icon: Wrench },
    { id: 'historico', label: 'Histórico', icon: History },
    ...(canal === 'email' ? [{ id: 'maestro', label: 'Maestro', icon: Bot }] : []),
  ]
  return <nav aria-label="Áreas dos flows de cobrança" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
    {tabs.map(({ id, label, icon: Icon }) => {
      const params = new URLSearchParams(query)
      params.set('aba', id)
      params.delete('pagina')
      params.delete('status')
      if (['gerar', 'saneamento'].includes(id) !== ['gerar', 'saneamento'].includes(aba)) {
        for (const key of ['inclusao_de', 'inclusao_ate', 'vencimento_de', 'vencimento_ate']) params.delete(key)
      }
      return <ButtonLink key={id} href={`${flowCobrancaPath(canal)}?${params}`} prefetch={false} variant={aba === id ? 'primary' : 'ghost'} aria-current={aba === id ? 'page' : undefined}><Icon size={16} />{label}</ButtonLink>
    })}
  </nav>
}
