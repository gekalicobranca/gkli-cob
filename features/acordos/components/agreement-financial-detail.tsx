import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento';
import { resumoRepassesConsulta, valorCadastrado } from '@/features/acordos/consulta-financeira';

const moeda = (value: unknown) => { const n = valorCadastrado(value as number | string | null); return n == null ? 'Não informado' : formatCurrency(n); };

export function AgreementFinancialDetail({ acordo, cotas, parcelas, view = 'complete', identity }: { acordo: any; cotas: any[]; parcelas: any[]; view?: 'complete' | 'summary' | 'cotas'; identity?: ReactNode }) {
  // Older agreements may only have the primary charge. Never show it twice.
  const unicas = [...new Map(cotas.filter(c => c.cobranca_id).map(c => [c.cobranca_id, c])).values()];
  const linhas = unicas.length ? unicas : acordo.cobrancas ? [{ cobranca_id: acordo.cobrancas.id, cobrancas: { ...acordo.cobrancas, unidades: acordo.unidades }, referenciaAtual: true }] : [];
  const repasse = resumoRepassesConsulta(acordo, parcelas);
  const snapshot = linhas.length > 0 && linhas.every(c => !c.referenciaAtual && valorCadastrado(c.valor_original_no_acordo) != null && Number(c.valor_total_no_acordo) > 0);
  const original = snapshot ? linhas.reduce((sum, c) => sum + Number(c.valor_original_no_acordo), 0) : valorCadastrado(acordo.valor_original);
  const somaHistorica = (campo: string) => snapshot ? linhas.reduce((sum, c) => sum + Number(c[campo] ?? 0), 0) : null;
  const correcaoCompleta = linhas.length > 0 && linhas.every(c => valorCadastrado(c.cobrancas?.correcao) != null);
  const correcao = correcaoCompleta ? linhas.reduce((sum, c) => sum + Number(c.cobrancas.correcao), 0) : null;
  const pagas = parcelas.filter(p => p.data_pagamento || ['paga','pago','quitada','quitado'].includes(String(p.status).toLowerCase()));
  const pago = [...new Map(pagas.map(p => [p.id, p])).values()].reduce((sum, p) => sum + Number(p.valor ?? 0), 0);
  if (view === 'cotas' && linhas.length === 0) return <p id="cotas-acordo" className="scroll-mt-14 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500"><strong className="font-medium text-slate-700">Cotas:</strong> sem cotas de origem vinculadas.</p>;
  return <section className="space-y-4" aria-label={view === 'summary' ? 'Resumo do acordo' : view === 'cotas' ? 'Cotas do acordo' : 'Composição financeira do acordo'}>
    {view !== 'cotas' && <Card id="resumo-acordo" className="space-y-2 scroll-mt-14 p-3">
      <h2 className="text-base font-semibold text-slate-950">Resumo do acordo</h2>
      {identity}
      <dl className="divide-y divide-slate-100">
        {original != null && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5 text-sm"><dt className="w-32 shrink-0 text-slate-600">Original</dt><dd className="font-semibold tabular-nums text-slate-950">{moeda(original)}</dd></div>}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5 text-sm"><dt className="w-32 shrink-0 text-slate-600">Valor acordado</dt><dd className="font-semibold tabular-nums text-slate-950">{moeda(acordo.valor_acordado)}</dd><dd className="text-xs text-slate-500">{pago === Number(acordo.valor_acordado) && pago > 0 ? 'Todas as parcelas pagas' : `Parcelas pagas: ${formatCurrency(pago)}`}</dd></div>
        {repasse.parcelas > repasse.semRepasse && <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5 text-sm"><dt className="w-32 shrink-0 text-slate-600">{repasse.semRepasse ? 'Repasse parcial' : 'Repasse previsto'}</dt><dd className="font-semibold tabular-nums text-slate-950">{formatCurrency(repasse.total)}</dd>{repasse.quantidadePagas > 0 && repasse.quantidadePagas < repasse.parcelas && <dd className="text-xs text-slate-500">Das parcelas pagas: {formatCurrency(repasse.pagos)}{repasse.semRepassePagas > 0 ? ' (parcial)' : ''}</dd>}</div>}
      </dl>
      {(original == null || repasse.semRepasse > 0) && <p className="text-xs leading-5 text-amber-800">Dados não informados: {[original == null ? 'valor original' : '', repasse.semRepasse > 0 ? `repasse de ${repasse.semRepasse} parcela(s)${repasse.semRepassePagas > 0 ? ` (${repasse.semRepassePagas} paga(s))` : ''}` : ''].filter(Boolean).join('; ')}.</p>}
    </Card>}
    {view !== 'summary' && <Card id="cotas-acordo" className="space-y-2 scroll-mt-14 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-950">Cotas incluídas no acordo</h2>{linhas.length > 0 && <span className="text-sm text-slate-600">{linhas.length} cota(s)</span>}</div>
      {linhas.length > 0 && <p className="text-xs text-slate-500">Valores da negociação; correção do cadastro atual da cota.</p>}
      {linhas.length ? <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
        <caption className="sr-only">Cotas que compõem a dívida negociada e seus valores</caption>
        <thead className="sticky top-0 bg-slate-50 text-slate-700"><tr>{['Cota / unidade', 'Original no acordo', 'Correção da cota (atual)', 'Atualizado no acordo', 'Encargos do acordo', 'Total no acordo'].map(h => <th scope="col" key={h} className="min-w-28 px-3 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{linhas.map(c => { const atual = c.cobrancas; const historico = !c.referenciaAtual && Number(c.valor_total_no_acordo) > 0; return <tr key={c.cobranca_id}>
          <td className="min-w-56 px-3 py-3 align-top"><Link className="font-semibold text-sky-800 underline" href={`/app/cobrancas/${c.cobranca_id}`}>Unidade {atual?.unidades?.identificacao ?? '—'}{atual?.unidades?.bloco ? ` / ${atual.unidades.bloco}` : ''}</Link><p className="mt-1 text-slate-600">Competência: {atual?.competencia || 'Não informada'}</p><p className="text-slate-600">Venc.: {formatarVencimentoAcordo(atual?.vencimento)}</p><details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer text-sky-800">Juros, multa e desconto atuais</summary><div className="mt-1 space-y-1"><p>Original da cota: {moeda(atual?.valor_original)}</p><p>Juros: {moeda(atual?.juros)}</p><p>Multa: {moeda(atual?.multa)}</p><p>Desconto: {moeda(atual?.desconto)}</p><p>Atualizado da cota: {moeda(atual?.valor_atualizado)}</p></div></details></td>
          <td className="px-3 py-3 align-top tabular-nums">{historico ? moeda(c.valor_original_no_acordo) : 'Não registrado'}</td>
          <td className="px-3 py-3 align-top tabular-nums">{moeda(atual?.correcao)}</td>
          <td className="px-3 py-3 align-top tabular-nums">{historico ? moeda(c.valor_atualizado_no_acordo) : 'Não registrado'}</td>
          <td className="px-3 py-3 align-top tabular-nums">{historico ? moeda(c.encargos_no_acordo) : 'Não registrado'}</td>
          <td className="px-3 py-3 align-top font-semibold tabular-nums">{historico ? moeda(c.valor_total_no_acordo) : 'Não registrado'}</td>
        </tr>; })}</tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold tabular-nums"><tr><th scope="row" className="px-3 py-3">Totais das cotas</th>{[somaHistorica('valor_original_no_acordo'), correcao, somaHistorica('valor_atualizado_no_acordo'), somaHistorica('encargos_no_acordo'), somaHistorica('valor_total_no_acordo')].map((value, i) => <td key={i} className="px-3 py-3">{moeda(value)}</td>)}</tr></tfoot>
      </table></div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Sem cotas de origem vinculadas.</p>}
      {(Number(acordo.despesa_cobranca_valor) > 0 || Number(acordo.credito_administradora_utilizado) > 0) && <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">{Number(acordo.despesa_cobranca_valor) > 0 && <span>Despesas do acordo: {moeda(acordo.despesa_cobranca_valor)}</span>}{Number(acordo.credito_administradora_utilizado) > 0 && <span>Crédito utilizado: {moeda(acordo.credito_administradora_utilizado)}</span>}</div>}
    </Card>}
  </section>;
}
