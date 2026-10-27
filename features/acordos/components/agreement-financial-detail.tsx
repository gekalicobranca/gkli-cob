import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/formatters/currency';
import { formatarVencimentoAcordo } from '@/features/acordos/formatar-vencimento';
import { resumoRepassesConsulta, valorCadastrado } from '@/features/acordos/consulta-financeira';

const moeda = (value: unknown) => { const n = valorCadastrado(value as number | string | null); return n == null ? 'Não informado' : formatCurrency(n); };

export function AgreementFinancialDetail({ acordo, cotas, parcelas }: { acordo: any; cotas: any[]; parcelas: any[] }) {
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
  return <section className="space-y-4" aria-label="Composição financeira do acordo">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: 'Original do acordo', value: moeda(original), help: snapshot ? 'Soma das cotas na negociação' : 'Valor registrado no acordo' },
        { label: 'Valor acordado', value: moeda(acordo.valor_acordado), help: `Pago: ${formatCurrency(pago)}` },
        { label: repasse.semRepasse ? 'Repasse cadastrado (parcial)' : 'Repasse previsto', value: repasse.parcelas === repasse.semRepasse ? 'Não informado' : formatCurrency(repasse.total), help: repasse.semRepasse ? `${repasse.semRepasse} parcela(s) sem repasse` : `${repasse.parcelas} parcela(s), incluindo entrada` },
        { label: repasse.semRepassePagas ? 'Repasse das pagas (parcial)' : 'Repasse das parcelas pagas', value: repasse.semRepassePagas > 0 && repasse.semRepassePagas === repasse.quantidadePagas ? 'Não informado' : formatCurrency(repasse.pagos), help: repasse.semRepassePagas ? `${repasse.semRepassePagas} parcela(s) paga(s) sem repasse cadastrado` : 'Pagamento da parcela; não confirma transferência de honorários' },
      ].map(m => <Card key={m.label} className="space-y-1"><p className="text-sm text-slate-600">{m.label}</p><p className="text-xl font-semibold tabular-nums text-slate-950">{m.value}</p><p className="text-xs leading-5 text-slate-500">{m.help}</p></Card>)}
    </div>
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-950">Cotas incluídas no acordo</h2><span className="text-sm text-slate-600">{linhas.length} cota(s)</span></div>
      <p className="text-sm text-slate-600">Original, atualizado, encargos e total preservam os valores da negociação quando disponíveis. A correção vem do cadastro atual da cota e pode ter mudado após o acordo.</p>
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
      </table></div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este acordo não tem cotas de origem vinculadas. A composição não pode ser detalhada sem esse vínculo.</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600"><span>Despesas do acordo: {moeda(acordo.despesa_cobranca_valor)}</span><span>Crédito utilizado: {moeda(acordo.credito_administradora_utilizado)}</span></div>
      <p className="text-xs leading-5 text-slate-500">O repasse é exibido por parcela, sem rateio presumido entre cotas. {repasse.calculados > 0 ? `${repasse.calculados} parcela(s) usam a regra cadastrada no acordo, igual ao painel da TV.` : 'Valores não cadastrados ficam identificados como não informados.'} Valores deste acordo completo, sem filtro de período.</p>
    </Card>
  </section>;
}
