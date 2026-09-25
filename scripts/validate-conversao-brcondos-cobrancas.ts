import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { detectBrcondosCobrancas, parseBrcondosCobrancas } from "../features/conversao-relatorio/server/brcondos-cobrancas";
import { buildPreviewFromRecibos, parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { anoCorrenteImportacao } from "../features/importacoes/recorte-cobrancas";

const year = anoCorrenteImportacao();
const tableHeader = "FaturaUnidadeNomeContaDocumento\nNosso Numero\nGrupo de Histórico\nEmissão/Competência\nVencimento\nPago/Negociado Em\nValorJurosMultaCorreçãoDesconto\nValor Pago\nCarteira/Status\nObservação\nCentro de Custo\nImpr. Bol.\nStatus";
const text = `Relatório de Contas a Receber - CONDOMÍNIO EXEMPLO
Totalizadores:
Valor Total: R$ 100,00
Valor Total Geral ((Valor Total + Juros + Multa + Correção) - Descontos): R$ 96,00
Valor Total Pago: R$ 0,00
Valor Total Juros: R$ 1,00
Valor Total Multa: R$ 2,00
Valor Total Correção: R$ 3,00
Valor Total de Descontos: R$ 10,00
Quantidade de Faturas: 01
Quantidade de Unidades Únicas: 01
${tableHeader}
100001UNIDADE,
N° 01
ANA EXEMPLO
(123.456.789-
00)
Sem Movimento
9001-ACORDO/NEGOCIAÇÃO01/08/${year}30/09/${year}-100,001,002,003,0010,000,00Receber
Observação antes da quebra
-NA VENCER
${tableHeader}
Continuação depois da quebra. Parcela 2/3
BRCondos - 01/09/${year} | 10:00:00`;

async function main() {
  assert.equal(detectBrcondosCobrancas(text)?.condominioDetectado, "CONDOMÍNIO EXEMPLO");
  assert.equal(detectBrcondosCobrancas(text.replace("BRCondos", "Outro sistema")), null);
  assert.equal(detectBrcondosCobrancas("BRCondos Lista de Moradores"), null);
  const parsed = parseBrcondosCobrancas(text);
  if (parsed.ok === false) throw new Error(parsed.error);
  assert.equal(parsed.recibos.length, 1);
  assert.deepEqual({ ...parsed.recibos[0], detalhesOrigem: undefined }, {
    recibo: "100001", unidade: "01", bloco: "", responsavel: "ANA EXEMPLO",
    responsavelDocumento: "123.456.789-00", vencimento: `30/09/${year}`,
    valorPrincipal: 100, juros: 1, multa: 2, correcao: 3, desconto: 10, valorTotal: 96,
    marcadorOrigem: "A", situacaoOrigem: "acordo", detalhesOrigem: undefined,
  });
  assert.match(parsed.recibos[0].detalhesOrigem ?? "", /Continuação depois da quebra\. Parcela 2\/3/);
  assert.doesNotMatch(parsed.recibos[0].detalhesOrigem ?? "", /FaturaUnidade/);
  const normal = parseBrcondosCobrancas(text.replaceAll("ACORDO/NEGOCIAÇÃO", "COTA CONDOMINIAL").replace("A VENCER", "VENCIDO"));
  assert.ok(normal.ok);
  assert.equal(normal.recibos[0].situacaoOrigem, "normal");
  assert.equal(normal.inconsistencias.length, 0);
  const corruptions = [
    text.replace("Quantidade de Faturas: 01", "Quantidade de Faturas: 02"),
    text.replace("Quantidade de Unidades Únicas: 01", "Quantidade de Unidades Únicas: 02"),
    text.replace("Valor Total: R$ 100,00", "Valor Total: R$ 101,00"),
    text.replace("R$ 96,00", "R$ 95,00"),
    text.replace("10,000,00Receber", "10,0020,00Receber"),
    text.replaceAll(`30/09/${year}`, `31/09/${year}`),
    text.replace("A VENCER", "CANCELADO"),
    text.replace("0,00Receber", "0,00Pago"),
  ];
  for (const invalid of corruptions) assert.equal(parseBrcondosCobrancas(invalid).ok, false);

  // Discount must survive the common preview and XLSX writers.
  const output = buildPreviewFromRecibos({
    recibos: parsed.recibos, origem: "BRCondos", origemSistema: "BRCondos",
    padraoDetectado: detectBrcondosCobrancas(text)!,
    filename: "teste.pdf", condominioCnpj: "12345678000100",
  });
  if (output.ok === false) throw new Error(output.error);
  const workbook = XLSX.read(Buffer.from(output.preview.xlsxBase64, "base64"));
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets.dados);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valor_original, 100);
  assert.equal(rows[0].valor_atualizado, 96);
  assert.equal(rows[0]["total do recibo"], 96);
  assert.equal(rows[0].responsavel_documento, "123.456.789-00");
  assert.equal(rows[0].unidade, "01");
  assert.equal(rows[0].situacao_origem, "acordo");
  assert.equal(rows[0].condominio_cnpj, "12345678000100");

  if (process.argv[2]) {
    const result = await parseRelatorioBuffer({
      buffer: readFileSync(process.argv[2]), filename: "referencia.pdf", tipoConversao: "cobrancas",
    });
    if (result.ok === false) throw new Error(result.error);
    const records = result.preview.cobrancasRankingMensal ?? [];
    assert.equal(records.length, 4);
    assert.equal(Math.round(records.reduce((sum, item) => sum + item.valorTotal, 0) * 100), 692197);
    assert.deepEqual(records.map((item) => item.recibo), ["16338592", "16338593", "16338594", "16649402"]);
    assert.deepEqual(records.map((item) => item.unidade), ["08", "08", "08", "03"]);
    assert.deepEqual(records.map((item) => item.vencimento), ["30/09/2026", "30/10/2026", "30/11/2026", "22/09/2026"]);
    assert.ok(records.every((item) => item.situacaoOrigem === "acordo" && item.responsavelDocumento));
    assert.match(records[1].detalhesOrigem ?? "", /Parcela 6\/ 7/);
    console.log("PDF de referência: 4 faturas em 2 unidades, total de R$ 6.921,97.");
  }
  console.log("BRCondos cobranças: extração, descontos, reconciliação, quebras de página e XLSX validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
