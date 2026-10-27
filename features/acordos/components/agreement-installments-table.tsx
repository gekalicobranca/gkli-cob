import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento';
import { repasseConsulta } from '@/features/acordos/consulta-financeira';

export function AgreementInstallmentsTable({ acordo, parcelas, renderActions }: { acordo: any; parcelas: any[]; renderActions?: (parcela: any) => ReactNode }) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return <Card id="parcelas-acordo" className="space-y-2 scroll-mt-14 p-3" data-section="parcelas-acordo">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-semibold text-slate-950">Parcelas do acordo</h2><span className="text-xs text-slate-500">{parcelas.length} parcela(s){parcelas.some(p => p.tipo === 'entrada' || p.tipo_parcela === 'entrada') ? ', incluindo entrada' : ''}</span></div>
    {parcelas.length === 0 ? <p className="py-2 text-sm text-slate-600">Nenhuma parcela cadastrada.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm"><caption className="sr-only">Parcelas, pagamentos e repasses do acordo</caption>
        <thead className="bg-slate-50 text-slate-600"><tr>{['Parcela','Status','Vencimento','Pagamento','Valor','Repasse','Ações'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{parcelas.map(p => {
          const status = String(p.status ?? '').toLowerCase();
          const paga = Boolean(p.data_pagamento) || ['paga','pago','quitada','quitado'].includes(status);
          const cancelada = ['cancelado','cancelada'].includes(status);
          const encerrada = paga || cancelada || ['cancelado','quitado','rompido','quebrado'].includes(String(acordo.status));
          const repasse = repasseConsulta(acordo,p);
          const atraso = !paga && !cancelada && p.vencimento && p.vencimento < hoje;
          const badge = paga ? 'bg-emerald-50 text-emerald-800' : cancelada ? 'bg-slate-100 text-slate-600' : atraso ? 'bg-rose-50 text-rose-800' : 'bg-sky-50 text-sky-800';
          return <tr key={p.id} className="align-top hover:bg-slate-50/60">
            <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{p.tipo === 'entrada' || p.tipo_parcela === 'entrada' ? 'Entrada' : `#${p.numero}`}</th>
            <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>{paga ? 'Paga' : cancelada ? 'Cancelada' : status.replaceAll('_',' ') || 'Não informado'}</span>{atraso && !['vencida','em_atraso'].includes(status) && <span className="mt-1 block whitespace-nowrap text-xs text-rose-700">Em atraso</span>}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatarVencimentoAcordo(p.vencimento)}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{p.data_pagamento ? formatarVencimentoAcordo(p.data_pagamento) : '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-950">{formatCurrency(Number(p.valor ?? 0))}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums" title={repasse.origem}>{repasse.valor == null ? <span className="text-slate-500">Não informado</span> : <><span className="font-semibold text-slate-950">{formatCurrency(repasse.valor)}</span><span className="mt-1 block text-xs text-slate-500">{repasse.origem.startsWith('Calculado') ? 'Regra do acordo' : 'Informado'}</span></>}</td>
            <td className="px-4 py-3">{!encerrada && renderActions ? <details className="min-w-36"><summary className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center text-sm font-medium text-sky-800">Gerenciar</summary><div className="mt-3 min-w-64">{renderActions(p)}</div></details> : <span className="text-slate-400">—</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </Card>;
}
