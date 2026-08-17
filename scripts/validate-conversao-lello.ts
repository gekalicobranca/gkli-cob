import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

async function main() {
  const rows: unknown[][] = [
    ["", "", "Cotas Atrasadas"],
    ["", "", "Período de:", "", "", "", "", " até "],
    ["", "", "", "", "Empresa", "", "", "", "", "", "Lello Condomínios"],
    ["", "", "", "", "Referência", "", "", "", "", "", "182", "", "BOSQUE MARAJOARA"],
    ["", "", "", "", "Unidade", "", "", "", "", "", "00013D", "", "PAULO SILAS SIQUEIRA JUNIOR"],
    ["", "", "", "", "", "", "", "", "Vencimento", "", "", "", "", "", "Valor Original", "", "Valor Multa", "Correção/Juros", "", "", "", "Total"],
    ["", "", "", "", "", "", "", "", "10/08/2026", "", "", "", "", "", "874,35", "", "17,49", "0,00", "", "", "", "891,84"],
    ["", "", "", "", "", "", "", "", "", "Conta", "", "", "", "", "Histórico", "", "", "Correção/Juros"],
    ["", "", "", "", "", "", "", "", "", "1002", "", "", "", "", "COTAS CONDOMINIAIS", "", "", "590,98"],
    ["", "", "", "", "Empresa", "", "", "", "", "", "Lello Condomínios"],
    ["", "", "", "", "Referência", "", "", "", "", "", "182", "", "BOSQUE MARAJOARA"],
    ["", "", "", "", "Unidade", "", "", "", "", "", "00031B", "", "MARCOS HENRIQUE DO NASCIMENTO"],
    ["", "", "", "", "", "", "", "", "Vencimento", "", "", "", "", "", "Valor Original", "", "Valor Multa", "Correção/Juros", "", "", "", "Total"],
    ["", "", "", "", "", "", "", "", "10/07/2026", "", "", "", "", "", "884,79", "", "17,70", "13,25", "", "", "", "915,74"],
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Inadimplentes");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const result = await parseRelatorioBuffer({
    buffer,
    filename: "CotasInadimplentes_182.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tipoConversao: "cobrancas",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.preview.padraoDetectado?.id, "lello-cotas-atrasadas-xlsx-cobrancas-v1");
  assert.equal(result.preview.padraoDetectado?.condominioDetectado, "BOSQUE MARAJOARA");
  assert.equal(result.preview.totalParcelas, 2);
  assert.equal(result.preview.valorTotal, 1807.58);
  assert.deepEqual(
    result.preview.cobrancas.map((item) => ({
      unidade: item.unidade,
      vencimento: item.vencimento,
      valorPrincipal: item.valorPrincipal,
      multa: item.multa,
      correcao: item.correcao,
      valorTotal: item.valorTotal,
    })),
    [
      { unidade: "00013D", vencimento: "10/08/2026", valorPrincipal: 874.35, multa: 17.49, correcao: 0, valorTotal: 891.84 },
      { unidade: "00031B", vencimento: "10/07/2026", valorPrincipal: 884.79, multa: 17.7, correcao: 13.25, valorTotal: 915.74 },
    ],
  );
  assert.match(result.preview.cobrancas[0]?.detalhesOrigem ?? "", /1002 COTAS CONDOMINIAIS: R\$ 590,98/);
  assert.match(result.preview.csv, /2026-08-10/);

  console.log("Conversão Lello XLSX validada com sucesso.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
