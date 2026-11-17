import { dataCivilValida } from '@/lib/core/data-civil';
import { moneyFromForm } from '@/utils/formatters/parse-money';

export type ParcelaManual = {
  numero: number;
  cota: string;
  despesa: string;
  vencimento: string;
};
export function lerPlanoManual(raw: unknown, quantidade: number) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 20000) throw new Error('Plano manual inválido.');
  let itens: unknown;
  try { itens = JSON.parse(raw); } catch { throw new Error('Plano manual inválido.'); }
  if (!Array.isArray(itens) || itens.length !== quantidade || quantidade < 1 || quantidade > 60) {
    throw new Error('Mantenha a quantidade de parcelas da simulação.');
  }
  const parcelas = itens.map((item, index) => {
    if (!item || item.numero !== index + 1 || !dataCivilValida(item.vencimento)) {
      throw new Error(`Informe um vencimento válido para a parcela ${index + 1}.`);
    }
    const cota = moneyFromForm(item.cota, `Cota da parcela ${index + 1}`, { format: 'form' });
    const despesa = moneyFromForm(item.despesa, `Despesa da parcela ${index + 1}`, { format: 'form' });
    if (cota <= 0 || cota > 9999999999.99) throw new Error(`Informe um valor de cota maior que zero para a parcela ${index + 1}.`);
    if (despesa < 0 || despesa > 9999999999.99) throw new Error(`Informe uma despesa válida para a parcela ${index + 1}.`);
    return { numero: index + 1, cota, despesa, valor: Math.round((cota + despesa) * 100) / 100, vencimento: item.vencimento as string };
  });
  const totalCentavos = parcelas.reduce((sum, parcela) => sum + Math.round(parcela.valor * 100), 0);
  if (totalCentavos > 999999999999) throw new Error('Total manual acima do limite permitido.');
  return { parcelas, total: totalCentavos / 100 };
}

/** Ajusta o rateio das cotas em centavos sem perder o total negociado. */
export function ratearTotalManual(total: number, bases: number[]) {
  const soma = bases.reduce((sum, base) => sum + Math.round(base * 100), 0);
  if (soma <= 0) throw new Error('Base do acordo inválida.');
  const centavos = Math.round(total * 100);
  let acumulado = 0;
  return bases.map(base => {
    acumulado += Math.round(base * 100);
    const anterior = acumulado - Math.round(base * 100);
    return (Math.round(centavos * (acumulado / soma)) - Math.round(centavos * (anterior / soma))) / 100;
  });
}
