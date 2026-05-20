import { Card } from '@/components/ui/card'
import type { CobrancaNextAction } from '../next-action'
import { nextActionTone } from '../next-action'

export function CobrancaNextActionCard({ action }: { action: CobrancaNextAction }) {
  return (
    <Card className={`border ${nextActionTone(action.prioridade)}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] opacity-60">Próxima melhor ação</p>
          <h2 className="mt-2 text-lg font-semibold">{action.titulo}</h2>
          <p className="mt-2 text-sm leading-6 opacity-80">{action.descricao}</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-right shadow-sm">
          <p className="text-xs opacity-60">score</p>
          <p className="text-2xl font-semibold">{action.score}</p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm font-medium shadow-sm">
        {action.acao}
      </div>
    </Card>
  )
}
