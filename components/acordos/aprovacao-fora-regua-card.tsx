import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { decidirAprovacaoForaRegua } from '@/features/acordos/aprovacao-fora-regua-actions';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatDateBR } from '@/utils/formatters/date';

export function AprovacaoForaReguaCard({ aprovacao, podeDecidir }: { aprovacao: any; podeDecidir: boolean }) {
  const proposta = aprovacao.proposta;
  const status = { pendente: 'Aguardando aprovação do gestor', aprovada: 'Proposta aprovada pelo gestor', rejeitada: 'Proposta rejeitada pelo gestor' }[String(aprovacao.status)];
  return <Card>
    <h2 className="text-lg font-semibold">{status}</h2>
    <p className="mt-2 text-sm text-slate-600">A inclusão de parcelas fora da régua depende de aprovação do gestor/admin. A decisão vale para os recibos e condições registrados abaixo. Alterações exigem nova análise.</p>
    <ul className="my-3 space-y-1 text-sm">
      {aprovacao.recibos_fora_regua.map((recibo: any) => <li key={recibo.id}>
        Vencimento {formatDateBR(recibo.vencimento)} · {formatCurrency(Number(recibo.valor))} · Régua D+{recibo.inicio_cobranca_dias}
      </li>)}
    </ul>
    <p className="text-sm font-semibold">Total proposto: {formatCurrency(Number(proposta.valor_acordado))} · Entrada: {formatCurrency(Number(proposta.entrada))} · Despesas: {formatCurrency(Number(proposta.despesa_cobranca_valor))}</p>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium">Conferir todos os pagamentos propostos</summary>
      <ul className="mt-2 space-y-1">{proposta.parcelas.map((parcela: any) => <li key={parcela.numero}>
        {parcela.tipo_parcela === 'entrada' ? 'Entrada' : `Parcela ${parcela.numero}`} · {formatDateBR(parcela.vencimento)} · {formatCurrency(Number(parcela.valor))}
      </li>)}</ul>
    </details>
    {aprovacao.justificativa && <p className="mt-3 text-sm">Justificativa: {aprovacao.justificativa}</p>}
    {aprovacao.acordo_id ? <Link className="mt-3 inline-block underline" href={`/app/acordos/${aprovacao.acordo_id}`}>Abrir acordo criado</Link>
      : aprovacao.status === 'pendente' && podeDecidir ? <form action={decidirAprovacaoForaRegua} className="mt-4 space-y-3">
        <input type="hidden" name="aprovacao_id" value={aprovacao.id} />
        <label className="block text-sm">Justificativa da decisão
          <textarea name="justificativa" required maxLength={2000} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" name="decisao" value="aprovada">Aprovar proposta registrada</Button>
          <Button type="submit" name="decisao" value="rejeitada" variant="secondary">Rejeitar proposta</Button>
        </div>
      </form> : aprovacao.status === 'pendente' ? <p className="mt-3 text-sm font-medium text-amber-800">Nenhum acordo, parcela ou envio será gerado enquanto aguarda a decisão.</p> : null}
  </Card>;
}
