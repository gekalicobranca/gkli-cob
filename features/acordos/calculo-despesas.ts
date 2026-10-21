const round = (value: number) => Math.round(value * 100) / 100;

/** Price mensal com juros arredondados por período e quitação exata na última parcela. */
export function calcularParcelamentoAcordo(saldo: number, quantidade: number, price: boolean) {
  if (!Number.isInteger(quantidade) || quantidade < 1 || !Number.isFinite(saldo) || saldo <= 0) return [];
  let saldoCentavos = Math.round(saldo * 100);
  const fator = Math.pow(1.01, quantidade);
  const prestacao = price
    ? Math.round(saldoCentavos * 0.01 * fator / (fator - 1))
    : Math.floor(saldoCentavos / quantidade);
  return Array.from({ length: quantidade }, (_, index) => {
    const juros = price ? Math.round(saldoCentavos * 0.01) : 0;
    const valor = index === quantidade - 1 ? saldoCentavos + juros : Math.min(prestacao, saldoCentavos + juros);
    const amortizacao = valor - juros;
    saldoCentavos -= amortizacao;
    return { numero: index + 1, valor: valor / 100, juros: juros / 100,
      amortizacao: amortizacao / 100, saldoDevedor: saldoCentavos / 100 };
  });
}

/** Rateia em centavos para que os itens fechem exatamente com o total. */
function ratear(total: number, bases: number[]) {
  const pesos = bases.map((base) => Math.round(base * 100));
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0) return bases.map(() => 0);
  const centavos = Math.round(total * 100);
  const valores = pesos.map((peso) => Math.floor(centavos * peso / soma));
  const ordem = pesos.map((peso, index) => ({ index, resto: (centavos * peso) % soma }))
    .filter(({ index }) => pesos[index] > 0)
    .sort((a, b) => b.resto - a.resto);
  const restante = centavos - valores.reduce((a, b) => a + b, 0);
  for (let index = 0; index < restante; index++) valores[ordem[index].index]++;
  return valores.map((valor) => valor / 100);
}

export function validarCotasSemDespesas(ids: string[], selecionadas: string[], autorizada: boolean) {
  if (ids.some((id) => !selecionadas.includes(id))) {
    throw new Error("A cota sem despesas deve fazer parte das cobranças selecionadas.");
  }
  if (ids.length > 0 && !autorizada) {
    throw new Error("Confirme a autorização da administradora para incluir a cota do mês sem despesas de cobrança.");
  }
}

function calcularValores(
  itens: { id: string; valor: number }[],
  cotasSemDespesas: string[],
  percentual: number,
  credito: number,
) {
  const bases = itens.map((item) => round(Math.max(0, item.valor)));
  const totalBase = round(bases.reduce((a, b) => a + b, 0));
  const creditoUtilizado = round(Math.min(Math.max(0, credito), totalBase));
  const creditos = ratear(creditoUtilizado, bases);
  const basesDespesa = bases.map((base, index) => cotasSemDespesas.includes(itens[index].id)
    ? 0 : round(base - creditos[index]));
  const baseDespesa = round(basesDespesa.reduce((a, b) => a + b, 0));
  const despesa = round(baseDespesa * Math.max(0, percentual) / 100);
  const despesas = ratear(despesa, basesDespesa);
  return {
    baseDespesa,
    despesa,
    creditoUtilizado,
    total: round(totalBase - creditoUtilizado + despesa),
    itens: itens.map((item, index) => ({
      id: item.id,
      credito: creditos[index],
      despesa: despesas[index],
      total: round(bases[index] - creditos[index] + despesas[index]),
    })),
  };
}


/** Uma parcela sem entrada, ou quitação integral na entrada, é pagamento à vista. */
export function calcularDespesasAcordo(
  itens: { id: string; valor: number }[],
  cotasSemDespesas: string[],
  percentual: number,
  credito: number,
  pagamento: { quantidadeParcelas: number; entrada: number; jurosAdicional?: boolean },
) {
  const comIsencao = calcularValores(itens, cotasSemDespesas, percentual, credito);
  const pagamentoAVista = (pagamento.quantidadeParcelas === 1 && pagamento.entrada === 0)
    || (comIsencao.total > 0 && round(pagamento.entrada) >= comIsencao.total);
  const isencaoAplicada = pagamentoAVista && cotasSemDespesas.length > 0;
  const valores = isencaoAplicada ? comIsencao : calcularValores(itens, [], percentual, credito);
  const parcelas = calcularParcelamentoAcordo(round(valores.total - pagamento.entrada),
    pagamento.quantidadeParcelas, Boolean(pagamento.jurosAdicional && !pagamentoAVista));
  const jurosAdicional = round(parcelas.reduce((total, parcela) => total + parcela.juros, 0));
  const jurosRateados = ratear(jurosAdicional, valores.itens.map((item) => item.total));
  return {
    ...valores,
    total: round(valores.total + jurosAdicional),
    jurosAdicional,
    parcelas,
    itens: valores.itens.map((item, index) => ({
      ...item,
      jurosAdicional: jurosRateados[index],
      total: round(item.total + jurosRateados[index]),
    })),
    pagamentoAVista,
    isencaoAplicada,
  };
}
