import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function CobrancaSideCards({ cobranca, acordoVigente, statusOperacional }: { cobranca: any; acordoVigente: any; statusOperacional: string }) {
  return (
    <div className="space-y-4">
      {acordoVigente ? (
        <Card className="border-emerald-100 bg-emerald-50/60">
          <h2 className="text-lg font-semibold text-emerald-950">Acordo vigente</h2>
          <div className="mt-4 space-y-2 text-sm text-emerald-900">
            <p>Status: {acordoVigente.status}</p>
            <p>Valor: {formatCurrency(asNumber(acordoVigente.valor_acordado))}</p>
            <p>Entrada: {formatCurrency(asNumber(acordoVigente.entrada))}</p>
            <p>Próxima parcela: {acordoVigente.proxima_parcela ? `${formatCurrency(asNumber(acordoVigente.proxima_parcela.valor))} em ${formatDateBR(acordoVigente.proxima_parcela.vencimento)}` : '-'}</p>
          </div>
          <div className="mt-4"><ButtonLink href={`/app/acordos/${acordoVigente.id}`} size="sm">Abrir acordo</ButtonLink></div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Régua de cobrança</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Etapa atual: {statusOperacional === 'novo' ? 'Entrada na régua' : statusOperacional}</p>
          <p>Próxima ação: revisar contato / disparo</p>
          <p>Regra do condomínio: D+{cobranca.condominios?.inicio_cobranca_dias ?? '-'}</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Responsável</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Nome: {cobranca.unidades?.responsavel_nome ?? '-'}</p>
          <p>Documento: {cobranca.unidades?.responsavel_documento ?? '-'}</p>
          <p>Telefone: {cobranca.unidades?.telefone ?? '-'}</p>
          <p>E-mail: {cobranca.unidades?.email ?? '-'}</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Condomínio</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>Nome: {cobranca.condominios?.nome ?? '-'}</p>
          <p>CNPJ: {cobranca.condominios?.cnpj ?? '-'}</p>
          <p>Administradora: {cobranca.condominios?.administradora ?? '-'}</p>
          <p>Régua: D+{cobranca.condominios?.inicio_cobranca_dias ?? '-'}</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-950">Observações</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{cobranca.observacoes ?? 'Nenhuma observação registrada.'}</p>
      </Card>
    </div>
  )
}
