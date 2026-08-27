import { Layers, Network } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

const etapas = [
  ['1', 'Painel', 'Selecionar acordos, parcelas ou eventos elegíveis.'],
  ['2', 'Processamento', 'Preparar comunicação, aprovações e pré-condições.'],
  ['3', 'Lote + Régua', 'Gerar conteúdo e escolher agenda/template do fluxo de acordos.'],
  ['4', 'Flow', 'Executar, acompanhar agenda, falhas, reenvios e conclusão.'],
]

export default function FlowAcordosPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Flows"
        title="Flow acordos"
        description="Nova esteira para montagem e execução monitorada dos flows de acordos, independente do módulo atual de Comunicação."
        actions={<div className="flex flex-wrap gap-2">
          <ButtonLink href="/app/regua-acordo" variant="header"><Network size={16} />Réguas</ButtonLink>
          <ButtonLink href="/app/lotes?tipo=regua_acordo" variant="header"><Layers size={16} />Lotes</ButtonLink>
        </div>}
      />

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Modelo operacional</h2>
          <p className="mt-1 text-sm text-slate-500">
            Esta tela será construída seguindo o padrão Painel, Processamento, Lote, Régua e Flow.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {etapas.map(([numero, titulo, descricao]) => (
            <div key={numero} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-800">{numero}</span>
              <h3 className="mt-3 text-sm font-semibold text-slate-950">{titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{descricao}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
