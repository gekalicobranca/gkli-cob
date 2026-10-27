import { tvExpectedTransfer, type TvAgreement, type TvInstallment } from '@/features/dashboard/tv-metrics';

type Money = number | string | null | undefined;
export function valorCadastrado(value: Money): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function repasseConsulta(acordo: { despesa_cobranca_valor?: Money; valor_acordado?: Money; despesa_cobranca_percentual?: Money }, parcela: { valor_repasse_informado?: Money; valor?: Money }) {
  const informado = valorCadastrado(parcela.valor_repasse_informado);
  if (informado != null && informado >= 0) return { valor: informado, origem: 'Informado na parcela' };
  if ((Number(acordo.despesa_cobranca_valor) > 0 && Number(acordo.valor_acordado) > 0) || Number(acordo.despesa_cobranca_percentual) > 0) {
    return { valor: tvExpectedTransfer(acordo as TvAgreement, parcela as TvInstallment), origem: 'Calculado pela regra do acordo' };
  }
  return { valor: null, origem: 'Repasse não informado' };
}
export function resumoRepassesConsulta(acordo: Parameters<typeof repasseConsulta>[0], parcelas: Array<Parameters<typeof repasseConsulta>[1] & { id: string; status?: string | null; data_pagamento?: string | null }>) {
  const unicas = [...new Map(parcelas.map(p => [p.id, p])).values()].filter(p => !['cancelado','cancelada'].includes(String(p.status).toLowerCase()));
  let total = 0, pagos = 0, semRepasse = 0, semRepassePagas = 0, quantidadePagas = 0, calculados = 0;
  for (const p of unicas) {
    const repasse = repasseConsulta(acordo, p);
    const paga = Boolean(p.data_pagamento || ['paga','pago','quitada','quitado'].includes(String(p.status).toLowerCase()));
    if (paga) quantidadePagas++;
    if (repasse.valor == null) { semRepasse++; if (paga) semRepassePagas++; continue; }
    total += repasse.valor;
    if (repasse.origem.startsWith('Calculado')) calculados++;
    if (paga) pagos += repasse.valor;
  }
  return { total: Math.round(total * 100) / 100, pagos: Math.round(pagos * 100) / 100, semRepasse, semRepassePagas, quantidadePagas, calculados, parcelas: unicas.length };
}
