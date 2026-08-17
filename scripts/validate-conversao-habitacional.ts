import assert from "node:assert/strict";
import { parseHabitacionalCobrancasPdf } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

const text = `
Inadimplência Atualizada
Condomínio: 3118 - MAIS ESTILO & DESIGN MORUMBICNPJ: 19.436.901/0001-59
Bloco: 2 • Unidade: 000025 LYGIA FERNANDES DE MORAES CPF: 348.411.008-22
Celular: 11944082788Celular: 11993185355
E-mail: lygia@orionlog.com.br
BoletoVencimentoEmissãoContaHistóricoValorMulta Atualização Monetária JurosTotal
16497180520,9105/11/22161,6656,745,93296,58J234975248Cotas de meses anteriores
36,320,800,170,6934,663620Fundo de reserva
537,4510,75102,82292,96943,98Total do boleto:
537,4510,75102,82292,96943,98Total da Unidade:
`;

const recibos = parseHabitacionalCobrancasPdf(text);
assert.equal(recibos.length, 1);
assert.deepEqual(
  {
    bloco: recibos[0]?.bloco,
    unidade: recibos[0]?.unidade,
    responsavel: recibos[0]?.responsavel,
    documento: recibos[0]?.responsavelDocumento,
    telefone: recibos[0]?.telefone,
    email: recibos[0]?.email,
    recibo: recibos[0]?.recibo,
    vencimento: recibos[0]?.vencimento,
    valorPrincipal: recibos[0]?.valorPrincipal,
    multa: recibos[0]?.multa,
    correcao: recibos[0]?.correcao,
    juros: recibos[0]?.juros,
    valorTotal: recibos[0]?.valorTotal,
    marcador: recibos[0]?.marcadorOrigem,
    situacao: recibos[0]?.situacaoOrigem,
  },
  {
    bloco: "2",
    unidade: "000025",
    responsavel: "LYGIA FERNANDES DE MORAES",
    documento: "348.411.008-22",
    telefone: "11944082788 | 11993185355",
    email: "lygia@orionlog.com.br",
    recibo: "16497180",
    vencimento: "05/11/2022",
    valorPrincipal: 537.45,
    multa: 10.75,
    correcao: 102.82,
    juros: 292.96,
    valorTotal: 943.98,
    marcador: "J",
    situacao: "juridico",
  },
);
assert.match(recibos[0]?.detalhesOrigem ?? "", /Cotas de meses anteriores/);
assert.match(recibos[0]?.detalhesOrigem ?? "", /Fundo de reserva/);

console.log("Conversão Habitacional PDF validada com sucesso.");
