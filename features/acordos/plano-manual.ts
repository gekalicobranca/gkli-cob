import { dataCivilValida } from '@/lib/core/data-civil';
import { moneyFromForm } from '@/utils/formatters/parse-money';

export type ParcelaManual = { numero: number; valor: string; vencimento: string };
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
    const valor = moneyFromForm(item.valor, `Parcela ${index + 1}`, { format: 'form' });
    if (valor <= 0 || valor > 9999999999.99) throw new Error(`Informe um valor maior que zero para a parcela ${index + 1}.`);
    return { numero: index + 1, valor, vencimento: item.vencimento as string };
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
