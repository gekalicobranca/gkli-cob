import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularDespesasAcordo, validarCotasSemDespesas } from "../features/acordos/calculo-despesas";
import { guardarFormularioProposta } from "../features/acordos/aprovacao-fora-regua";

test("opção mensal é preservada ao recuperar a proposta", () => {
  const form = new FormData();
  assert.equal(guardarFormularioProposta(form).juros_adicional, "");
  form.set("juros_adicional", "on");
  assert.equal(guardarFormularioProposta(form).juros_adicional, "on");
});

test("juros simples mensais incidem no saldo após crédito, despesas e entrada", () => {
  const calcular = (entrada: number, quantidadeParcelas = 3, jurosAdicional = true) =>
    calcularDespesasAcordo([{ id: "a", valor: 1000 }], [], 10, 100,
      { entrada, quantidadeParcelas, jurosAdicional });
  const resultado = calcular(200);
  assert.equal(resultado.jurosAdicional, 23.7);
  assert.equal(resultado.total, 1013.7);
  assert.equal(resultado.itens[0].total, resultado.total);
  assert.equal(resultado.despesa, 90);
  assert.equal(calcular(200, 3, false).total, 990);
  assert.equal(calcular(0, 1).jurosAdicional, 0);
  assert.equal(calcular(990).jurosAdicional, 0);
  assert.equal(calcular(200, 1).jurosAdicional, 7.9);
});

test("rateio dos juros fecha em centavos com o total contratado", () => {
  const resultado = calcularDespesasAcordo([
    { id: "a", valor: 333.33 }, { id: "b", valor: 333.33 }, { id: "c", valor: 333.34 },
  ], [], 0, 0, { entrada: 123.45, quantidadeParcelas: 3, jurosAdicional: true });
  assert.equal(resultado.jurosAdicional, 26.3);
  assert.equal(Math.round(resultado.itens.reduce((soma, item) => soma + item.total, 0) * 100), 102630);
});

const aVista = { quantidadeParcelas: 1, entrada: 0 };
const itens = [{ id: "atrasada", valor: 1000 }, { id: "mes", valor: 500 }];

test("cota autorizada compõe o acordo sem receber despesas", () => {
  const resultado = calcularDespesasAcordo(itens, ["mes"], 10, 0, aVista);
  assert.equal(resultado.total, 1600);
  assert.equal(resultado.despesa, 100);
  assert.equal(resultado.itens[1].despesa, 0);
  assert.equal(resultado.itens[1].total, 500);
  assert.equal(calcularDespesasAcordo(itens, [], 10, 0, aVista).total, 1650);
});

test("crédito é proporcional e só o saldo não isento gera despesas", () => {
  const resultado = calcularDespesasAcordo(itens, ["mes"], 10, 300, aVista);
  assert.equal(resultado.total, 1280);
  assert.equal(resultado.despesa, 80);
  assert.equal(resultado.itens[1].credito, 100);
  assert.equal(resultado.itens[1].despesa, 0);
});

test("isenção integral e crédito integral mantêm despesas zeradas", () => {
  assert.equal(calcularDespesasAcordo(itens, ["mes", "atrasada"], 10, 0, aVista).despesa, 0);
  assert.equal(calcularDespesasAcordo(itens, [], 10, 2000, aVista).total, 0);
});

test("rateio fecha em centavos sem atribuir resíduo à cota isenta", () => {
  const resultado = calcularDespesasAcordo([
    { id: "a", valor: 10.01 }, { id: "b", valor: 10.02 }, { id: "mes", valor: 10.03 },
  ], ["mes"], 7.5, 1, aVista);
  const soma = (campo: "credito" | "despesa" | "total") =>
    Math.round(resultado.itens.reduce((sum, item) => sum + item[campo], 0) * 100) / 100;
  assert.equal(soma("credito"), 1);
  assert.equal(soma("despesa"), resultado.despesa);
  assert.equal(soma("total"), resultado.total);
  assert.equal(resultado.itens[2].despesa, 0);
});

test("exige autorização e rejeita isenção de recibo fora do agrupamento", () => {
  assert.throws(() => validarCotasSemDespesas(["mes"], ["mes"], false), /autorização/);
  assert.throws(() => validarCotasSemDespesas(["outra"], ["mes"], true), /selecionadas/);
  assert.doesNotThrow(() => validarCotasSemDespesas(["mes"], ["mes"], true));
  assert.doesNotThrow(() => validarCotasSemDespesas([], ["mes"], false));
});


test("parcelamento cobra despesas também sobre a cota do mês", () => {
  for (const pagamento of [{ quantidadeParcelas: 3, entrada: 0 }, { quantidadeParcelas: 1, entrada: 500 }]) {
    const resultado = calcularDespesasAcordo(itens, ["mes"], 10, 0, pagamento);
    assert.equal(resultado.total, 1650);
    assert.equal(resultado.itens[1].despesa, 50);
    assert.equal(resultado.isencaoAplicada, false);
  }
});

test("quitação integral na entrada tem isenção; entrada parcial não", () => {
  assert.equal(calcularDespesasAcordo(itens, ["mes"], 10, 0, { quantidadeParcelas: 3, entrada: 1600 }).isencaoAplicada, true);
  assert.equal(calcularDespesasAcordo(itens, ["mes"], 10, 0, { quantidadeParcelas: 3, entrada: 1599.99 }).isencaoAplicada, false);
});

test("parcelamento com crédito mantém despesas sobre a cota e troca de modalidade recalcula", () => {
  const parcelado = calcularDespesasAcordo(itens, ["mes"], 10, 300, { quantidadeParcelas: 2, entrada: 0 });
  assert.equal(parcelado.total, 1320);
  assert.equal(parcelado.itens[1].despesa, 40);
  assert.equal(calcularDespesasAcordo(itens, ["mes"], 10, 300, aVista).total, 1280);
});


test("1% ao mês por três parcelas soma 30 reais a um saldo de mil", () => {
  const resultado = calcularDespesasAcordo([{ id: "a", valor: 1200 }], [], 0, 0,
    { entrada: 200, quantidadeParcelas: 3, jurosAdicional: true });
  assert.equal(resultado.jurosAdicional, 30);
  assert.equal(resultado.total - 200, 1030);
  assert.equal(calcularDespesasAcordo([{ id: "a", valor: 1200 }], [], 0, 0,
    { entrada: 200, quantidadeParcelas: 6, jurosAdicional: true }).jurosAdicional, 60);
});
