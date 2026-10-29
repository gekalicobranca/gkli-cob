import { ButtonLink } from '@/components/ui/button'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function destinatarioLabel(value?: string | null) {
  if (value === 'inquilino') return 'Inquilino'
  if (value === 'qualquer') return 'Qualquer contato'
  return 'Proprietário'
}

export function CobrancaSideCards({ cobranca, acordoVigente }: { cobranca: any; acordoVigente: any; statusOperacional: string }) {
  const regua = acordoVigente ? cobranca.regua_acordo : cobranca.regua_cobranca
  const tipoRegua = acordoVigente ? 'acordo' : 'cobrança'
  const reguaPadraoNome = acordoVigente ? 'Padrão interno de acordos' : 'Padrão interno de cobrança'
  const reguaTitulo = acordoVigente ? 'Régua de acordo' : 'Régua de cobrança'

  return (
    <div className="space-y-4">
      {acordoVigente ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">Acordo vinculado</summary>
          <div className="mt-4 space-y-2 text-sm text-emerald-900">
            <p>Status: {acordoVigente.status}</p>
            <p>Valor acordado: {formatCurrency(asNumber(acordoVigente.valor_acordado))}</p>
            <p>Entrada: {formatCurrency(asNumber(acordoVigente.entrada))}</p>
            <p>Pago: {formatCurrency(asNumber(acordoVigente.valor_pago))}</p>
            <p>Saldo em aberto: {formatCurrency(asNumber(acordoVigente.saldo_aberto))}</p>
            <p>Próxima parcela: {acordoVigente.proxima_parcela ? `${formatCurrency(asNumber(acordoVigente.proxima_parcela.valor))} em ${formatDateBR(acordoVigente.proxima_parcela.vencimento)}` : '-'}</p>
          </div>
        </details>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">{reguaTitulo}</summary>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Régua aplicada: <span className="font-medium text-slate-900">{regua?.nome ?? reguaPadraoNome}</span></p>
          <p>Destinatário: {destinatarioLabel(regua?.destinatario_preferencial)}</p>
        </div>
        {regua?.id ? (
          <div className="mt-4">
            <ButtonLink href={`/app/mensageria/reguas/${regua.id}`} size="sm" variant="secondary">Abrir régua</ButtonLink>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-slate-500">Sem régua de {tipoRegua} vinculada ao condomínio.</p>
        )}
      </details>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Dados do condomínio</summary>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>CNPJ: {cobranca.condominios?.cnpj ?? '-'}</p>
          <p>Administradora: {cobranca.condominios?.administradora ?? '-'}</p>
        </div>
      </details>

      {cobranca.observacoes ? <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Observações</summary>
        <p className="mt-2 text-sm leading-6 text-slate-600">{cobranca.observacoes ?? 'Nenhuma observação registrada.'}</p>
      </details> : null}
    </div>
  )
}
