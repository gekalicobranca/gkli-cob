import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export function CobrancaSideCards({ cobranca, acordoVigente, statusOperacional }: { cobranca: any; acordoVigente: any; statusOperacional: string }) {
  const regua = acordoVigente ? cobranca.regua_acordo : cobranca.regua_cobranca
  const tipoRegua = acordoVigente ? 'acordo' : 'cobrança'
  const reguaPadraoNome = acordoVigente ? 'Padrão interno de acordos' : 'Padrão interno de cobrança'
  const reguaTitulo = acordoVigente ? 'Régua de acordo' : 'Régua de cobrança'
  const etapaAtual = acordoVigente ? 'Acompanhamento do acordo' : statusOperacional === 'novo' ? 'Entrada na régua' : statusOperacional

  return (
    <div className="space-y-4">
      {acordoVigente ? (
        <Card className="border-emerald-100 bg-emerald-50/60">
          <h2 className="text-lg font-semibold text-emerald-950">Acordo vigente</h2>
          <div className="mt-4 space-y-2 text-sm text-emerald-900">
            <p>Status: {acordoVigente.status}</p>
            <p>Valor acordado: {formatCurrency(asNumber(acordoVigente.valor_acordado))}</p>
            <p>Entrada: {formatCurrency(asNumber(acordoVigente.entrada))}</p>
            <p>Pago: {formatCurrency(asNumber(acordoVigente.valor_pago))}</p>
            <p>Saldo em aberto: {formatCurrency(asNumber(acordoVigente.saldo_aberto))}</p>
            <p>Próxima parcela: {acordoVigente.proxima_parcela ? `${formatCurrency(asNumber(acordoVigente.proxima_parcela.valor))} em ${formatDateBR(acordoVigente.proxima_parcela.vencimento)}` : '-'}</p>
          </div>
          <div className="mt-4"><ButtonLink href={`/app/acordos/${acordoVigente.id}`} size="sm">Abrir acordo</ButtonLink></div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{reguaTitulo}</h2>
          <Badge tone={regua ? 'green' : 'slate'}>{regua ? 'Condomínio' : 'Padrão'}</Badge>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Régua aplicada: <span className="font-medium text-slate-900">{regua?.nome ?? reguaPadraoNome}</span></p>
          <p>Origem: {regua ? 'vínculo do condomínio' : 'fallback operacional'}</p>
          <p>Destinatário: {destinatarioLabel(regua?.destinatario_preferencial)}</p>
          <p>Etapa atual: {etapaAtual}</p>
          <p>Próxima ação: {acordoVigente ? 'monitorar vencimento das parcelas' : 'revisar contato / disparo'}</p>
        </div>
        {regua?.id ? (
          <div className="mt-4">
            <ButtonLink href={`/app/mensageria/reguas/${regua.id}`} size="sm" variant="secondary">Abrir régua</ButtonLink>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-slate-500">Sem régua de {tipoRegua} vinculada ao condomínio.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Responsável</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Documento: {cobranca.unidades?.responsavel_documento ?? '-'}</p>
          <p>Telefone: {cobranca.unidades?.telefone ?? '-'}</p>
          <p>E-mail: {cobranca.unidades?.email ?? '-'}</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Condomínio</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>CNPJ: {cobranca.condominios?.cnpj ?? '-'}</p>
          <p>Administradora: {cobranca.condominios?.administradora ?? '-'}</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Observações</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{cobranca.observacoes ?? 'Nenhuma observação registrada.'}</p>
      </Card>
    </div>
  )
}
