type ValoresCota = {
  valor_original?: number | null;
  valor_atualizado?: number | null;
  juros?: number | null;
  multa?: number | null;
  correcao?: number | null;
  desconto?: number | null;
};

/** O total atualizado já inclui encargos. Um total ainda igual ao principal
 * não deve esconder juros e multa discriminados na cobrança. */
export function valorCotaParaAcordo(cota: ValoresCota): number {
  const original = Number(cota.valor_original ?? 0);
  const atualizado = cota.valor_atualizado == null ? null : Number(cota.valor_atualizado);
  const composto = original + Number(cota.juros ?? 0) + Number(cota.multa ?? 0)
    + Number(cota.correcao ?? 0) - Number(cota.desconto ?? 0);
  const valor = atualizado !== null && Math.round(atualizado * 100) !== Math.round(original * 100)
    ? atualizado : composto;
  return Math.round(Math.max(0, valor) * 100) / 100;
}
