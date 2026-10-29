import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/utils/formatters/currency'

function moneyInput(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="space-y-1 text-xs font-medium text-slate-500">
      {label}
      <input name={name} defaultValue={moneyInput(value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none" />
    </label>
  )
}

function ValueBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-slate-100 px-2 py-2 ${highlight ? 'bg-cyan-50/60' : ''}`}>
      <p className={`text-xs ${highlight ? 'text-cyan-800' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${highlight ? 'text-cyan-950' : 'text-slate-950'}`}>{value}</p>
    </div>
  )
}

export function CobrancaFinanceiroCard({
  cobranca,
  principal,
  juros,
  multa,
  correcao,
  desconto,
  valorAtualizado,
  despesaCobranca,
  valorNegociacao,
  updateAction,
}: {
  cobranca: any
  principal: number
  juros: number
  multa: number
  correcao: number
  desconto: number
  valorAtualizado: number
  despesaCobranca: number
  valorNegociacao: number
  updateAction: (formData: FormData) => Promise<void>
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Composição financeira</h2>
        </div>
      </div>

      <div className="mt-2">
        <ValueBox label="Principal" value={formatCurrency(principal)} />
        <ValueBox label="Juros" value={formatCurrency(juros)} />
        <ValueBox label="Multa" value={formatCurrency(multa)} />
        <ValueBox label="Correção" value={formatCurrency(correcao)} />
        <ValueBox label="Total atualizado" value={formatCurrency(valorAtualizado)} />
        <ValueBox label="Desconto" value={formatCurrency(desconto)} />
        <ValueBox label="Despesa cobrança sugerida" value="10%" />
        <ValueBox label="Valor despesa" value={formatCurrency(despesaCobranca)} />
        <ValueBox label="Valor negociação" value={formatCurrency(valorNegociacao)} highlight />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-cyan-800">Editar valores</summary>
      <form action={updateAction} className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <input type="hidden" name="cobranca_id" value={cobranca.id} />
        <h3 className="text-sm font-semibold text-slate-950">Editar valores da cobrança</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field name="valor_original" label="Principal" value={principal} />
          <Field name="juros" label="Juros" value={juros} />
          <Field name="multa" label="Multa" value={multa} />
          <Field name="correcao" label="Correção" value={correcao} />
          <Field name="desconto" label="Desconto" value={desconto} />
        </div>
        <div className="mt-3">
          <Textarea name="observacao_financeira" defaultValue={cobranca.observacao_financeira ?? ''} placeholder="Observação financeira: origem dos valores, data do relatório da administradora, conferência manual..." />
        </div>
        <div className="mt-4 flex justify-end"><Button type="submit">Salvar valores</Button></div>
      </form>
      </details>
    </Card>
  )
}
