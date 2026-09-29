import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { detectBrcondominioDebitos, parseBrcondominioDebitos } from "../features/conversao-relatorio/server/brcondominio-debitos";
import { extractPdfVisualText } from "../features/conversao-relatorio/server/pdf-visual-text";
import { buildPreviewFromRecibos, parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { anoCorrenteImportacao } from "../features/importacoes/recorte-cobrancas";

const header = `CONDOMÍNIO EXEMPLO
Lista de Débitos
Critérios: Unidades encaminhadas ao Depto. Jurídico
Unidade Descrição Nº Título Dt. Pagto. Dt. Venc. Valor V. Pago/V. Corr. Pag. Meses Dias Correção Multa Juros Honorários Devido`;
const footer = "BRCondomínio - Portal de Automação de Condomínios 24/09/2026 15:14, Página 1 de 2";
const row = "H0406 Taxa Condominial Não 12345 05/09/2026 100,00 0 19 -0,32% 0,00 2,00 1,00 10,00% 10,30 113,30";
const sample = `${header}
${row}
Poolista - Agosto
${footer}
${header}
2026 + Dif. Julho 2026
Totais da Unidade: Qtd.: 1 100,00 0,00 0,00 1,00 113,30
0,00 2,00 10,30
Totais: Qtd.: 1 100,00 0,00 0,00 1,00 113,30
0,00 2,00 10,30
${footer}`;

async function main() {
  assert.equal(detectBrcondominioDebitos(sample)?.condominioDetectado, "CONDOMÍNIO EXEMPLO");
  assert.equal(detectBrcondominioDebitos(sample.replaceAll("BRCondomínio", "BRCondos")), null);
  const parsed = parseBrcondominioDebitos(sample);
  assert.equal(parsed.recibos.length, 1);
  assert.equal(parsed.inconsistencias.length, 0);
  const receipt = parsed.recibos[0];
  assert.equal(receipt.unidade, "H0406");
  assert.equal(receipt.bloco, "");
  assert.equal(receipt.responsavel, "");
  assert.equal(receipt.competencia, "08/2026");
  assert.equal(receipt.vencimento, "05/09/2026");
  assert.equal(receipt.situacaoOrigem, "juridico");
  assert.equal(receipt.correcao, 0);
  assert.equal(receipt.honorarios, 10.3);
  assert.match(receipt.detalhesOrigem ?? "", /Agosto 2026 \+ Dif\. Julho 2026/);
  assert.doesNotMatch(receipt.detalhesOrigem ?? "", /Página|CONDOMÍNIO EXEMPLO/);
  const rounded = parseBrcondominioDebitos(sample.replace(row, row.replace("113,30", "113,31")));
  assert.equal(rounded.recibos[0].valorTotal, 113.31);
  assert.ok(rounded.inconsistencias.length > 0);
  assert.throws(() => parseBrcondominioDebitos(sample.replace(row, row.replace("113,30", "115,30"))), /Encargos/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("Totais: Qtd.: 1 100,00", "Totais: Qtd.: 1 101,00")), /principal divergente/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("Totais: Qtd.: 1", "Totais: Qtd.: 2")), /Quantidade geral/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("Unidade: Qtd.: 1", "Unidade: Qtd.: 2")), /Quantidade de títulos/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("05/09/2026", "31/09/2026")), /Vencimento/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace(row, `${row}\n${row}`)), /duplicado/);
  assert.throws(() => parseBrcondominioDebitos(sample.split("Totais: Qtd.")[0]), /incompleto/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("100,00 0,00 0,00", "100,00 1,00 0,00")), /pagamentos/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("05/09/2026", "24/09/2026 05/09/2026")), /pagamento/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("Não 12345", "Não")), /incompleta/);
  assert.throws(() => parseBrcondominioDebitos(sample.replace("Critérios: Unidades", "Critérios: Outras unidades")), /Critérios/);

  const currentYear = anoCorrenteImportacao();
  const result = buildPreviewFromRecibos({ origem: "BRCondomínio", filename: "teste.pdf", recibos: [{ ...receipt, vencimento: `05/09/${currentYear}` }] });
  assert.ok(result.ok);
  const book = XLSX.read(Buffer.from(result.preview.xlsxBase64, "base64"));
  const exported = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets[book.SheetNames[0]]);
  assert.equal(exported[0].competencia, "08/2026");
  assert.equal(exported[0].unidade, "H0406");
  assert.equal(exported[0].responsavel_nome, "");
  assert.equal(exported[0]["total do recibo"], 113.3);
  assert.equal(exported[0].situacao_origem, "juridico");
  assert.match(result.preview.csv, /H0406/);

  const filename = process.argv[2];
  if (filename) {
    const buffer = readFileSync(filename);
    const full = parseBrcondominioDebitos(await extractPdfVisualText(buffer, 2));
    assert.equal(full.recibos.length, 220);
    assert.equal(new Set(full.recibos.map((r) => r.unidade)).size, 12);
    assert.equal(full.recibos.reduce((sum, r) => sum + Math.round(r.valorPrincipal * 100), 0), 24674713);
    assert.equal(full.recibos.reduce((sum, r) => sum + Math.round(r.valorTotal * 100), 0), 39744516);
    assert.ok(full.recibos.every((r) => r.situacaoOrigem === "juridico" && r.bloco === "" && r.responsavel === ""));
    assert.equal(full.recibos.find((r) => r.recibo === "24379")?.competencia, "09/2023");
    assert.equal(full.recibos.find((r) => r.recibo === "16896")?.competencia, undefined);
    const actual = await parseRelatorioBuffer({ buffer, filename, tipoConversao: "cobrancas", condominioCnpj: "12.345.678/0001-90" });
    if (actual.ok === false) throw new Error(actual.error);
    assert.equal(actual.preview.padraoDetectado?.id, "brcondominio-lista-debitos-cobrancas-v1");
    assert.equal(actual.preview.cobrancasRankingMensal?.length, 220);
    assert.ok(actual.preview.inconsistencias.some((s) => /Total geral:.*devido: -3 centavo/.test(s)));
    if (currentYear === 2026) {
      assert.equal(actual.preview.totalParcelas, 37);
      assert.equal(Math.round(actual.preview.valorTotal * 100), 6429403);
      const wb = XLSX.read(Buffer.from(actual.preview.xlsxBase64, "base64"));
      const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[wb.SheetNames[0]]);
      assert.equal(data.length, 37);
      assert.ok(data.every((r) => r.condominio_cnpj === "12.345.678/0001-90" && r.situacao_origem === "juridico"));
    }
    console.log("PDF real: 220 títulos, 12 unidades; soma R$ 397.445,16, total impresso R$ 397.445,19. Recorte 2026: 37 títulos, R$ 64.294,03.");
  }
  console.log("BRCondomínio: detecção, títulos, descrições entre páginas, encargos, arredondamento, rejeições e XLSX validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
