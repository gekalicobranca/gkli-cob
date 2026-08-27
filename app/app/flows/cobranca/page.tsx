import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

const etapas = [
  ['1', 'Painel', 'Selecionar cobranças elegíveis para o fluxo novo.'],
  ['2', 'Processamento', 'Preparar casos, validar dados e liberar disponibilidade.'],
  ['3', 'Lote + Régua', 'Gerar conteúdo e escolher agenda/template sem usar Comunicação atual.'],
  ['4', 'Flow', 'Enviar, pausar, cancelar, monitorar falhas e permitir reenvio.'],
]

export default function FlowCobrancaPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Flows"
        title="Flow cobrança"
        description="Nova esteira para montagem e execução monitorada dos flows de cobrança, independente do módulo atual de Comunicação."
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
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800">{numero}</span>
              <h3 className="mt-3 text-sm font-semibold text-slate-950">{titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{descricao}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
