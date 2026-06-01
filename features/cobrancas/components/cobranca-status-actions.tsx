import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { COBRANCA_STATUS_FINANCEIRO_LIST, COBRANCA_STATUS_LABEL, COBRANCA_STATUS_OPERACIONAL_LIST } from '@/lib/core/status'

export function CobrancaStatusActions({
  cobranca,
  statusOperacional,
  statusFinanceiro,
  updateStatusAction,
  createInteracaoAction,
}: {
  cobranca: any
  statusOperacional: string
  statusFinanceiro: string
  updateStatusAction: (formData: FormData) => Promise<void>
  createInteracaoAction: (formData: FormData) => Promise<void>
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Atualizar status</h2>
        <form action={updateStatusAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <select name="status" defaultValue={statusOperacional} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none">
            {COBRANCA_STATUS_OPERACIONAL_LIST.map((status) => (
              <option key={status} value={status}>{COBRANCA_STATUS_LABEL[status] ?? status}</option>
            ))}
          </select>
          <select name="status_financeiro" defaultValue={statusFinanceiro} disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 outline-none">
            {COBRANCA_STATUS_FINANCEIRO_LIST.map((status) => (
              <option key={status} value={status}>{COBRANCA_STATUS_LABEL[status] ?? status}</option>
            ))}
          </select>
          <div className="flex justify-end"><Button type="submit">Salvar status</Button></div>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Registrar interação</h2>
        <form action={createInteracaoAction} className="mt-4 space-y-4">
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input type="hidden" name="carteira_id" value={cobranca.carteira_id} />
          <select name="tipo" defaultValue="registro" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none">
            <option value="registro">registro</option>
            <option value="whatsapp">whatsapp</option>
            <option value="ligacao">ligação</option>
            <option value="email">e-mail</option>
            <option value="negociacao">negociação</option>
            <option value="alerta">alerta</option>
          </select>
          <Textarea name="conteudo" required placeholder="Descreva o contato, retorno do responsável, proposta ou próxima ação..." />
          <div className="flex justify-end"><Button type="submit">Salvar interação</Button></div>
        </form>
      </div>
    </div>
  )
}
