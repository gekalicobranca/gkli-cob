import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { detectThomazInadimplentes, parseThomazInadimplentes } from "../features/conversao-relatorio/server/thomaz-inadimplentes";
import { buildPreviewFromRecibos, parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { extractPdfVisualText } from "../features/conversao-relatorio/server/pdf-visual-text";
import { anoCorrenteImportacao } from "../features/importacoes/recorte-cobrancas";

const sample = `W003A CONDOMINIO EXEMPLO (106)
Inadimplentes
Valores atualizados até 24/09/2026
000023 1 - PESSOA EXEMPLO Jurídico
Vencimento Compet. Atraso Código Principal Juros Multa Atualiz. Honorários Total
13/03/26 04/2026 195 84448 100,00 5,00 2,00 3,00 4,00 114,00
THOMAZ MULTI ADMINISTRADORA LTDA
1 de 2
Total 100,00 5,00 2,00 3,00 4,00 114,00
000023 2 - OUTRA PESSOA
Vencimento Compet. Atraso Código Principal Juros Multa Atualiz. Honorários Total
13/09/26 09/2026 11 100528 200,00 1,00 4,00 0,00 0,00 205,00
Total 200,00 1,00 4,00 0,00 0,00 205,00
2 unidades inadimplentes (12,29%) 300,00 319,00`;

async function main() {
  assert.equal(detectThomazInadimplentes(sample)?.condominioDetectado, "CONDOMINIO EXEMPLO (106)");
  assert.ok(detectThomazInadimplentes(sample.replaceAll(" ", "").replace("THOMAZMULTIADMINISTRADORA", "THOMAZ MULTI ADMINISTRADORA").replace("Valoresatualizadosaté", "Valores atualizados até")));
  assert.equal(detectThomazInadimplentes(sample.replace("THOMAZ MULTI", "SLAVIERO")), null);
  assert.equal(detectThomazInadimplentes(sample.replaceAll("Atualiz.", "Desconto")), null);
  const receipts = parseThomazInadimplentes(sample);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].unidade, "000023");
  assert.equal(receipts[0].bloco, "1");
  assert.equal(receipts[1].bloco, "2");
  assert.equal(receipts[0].responsavel, "PESSOA EXEMPLO");
  assert.equal(receipts[0].situacaoOrigem, "juridico");
  assert.equal(receipts[1].situacaoOrigem, "normal");
  assert.equal(receipts[0].vencimento, "13/03/2026");
  assert.equal(receipts[0].competencia, "04/2026");
  assert.equal(receipts[0].correcao, 3);
  assert.equal(receipts[0].honorarios, 4);
  assert.throws(() => parseThomazInadimplentes(sample.replace("13/03/26", "31/02/26")), /Vencimento/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("04/2026", "13/2026")), /Competência/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("100,00 5,00", "101,00 5,00")), /Encargos/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("Total 100,00", "Total 101,00")), /Subtotal/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("300,00 319,00", "300,00 320,00")), /Total geral/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("2 unidades", "3 unidades")), /Quantidade/);
  assert.throws(() => parseThomazInadimplentes(sample.replace(/2 unidades[^\n]+/, "")), /incompleto/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("100,00 5,00 2,00 3,00 4,00 114,00", "100,00 5,00 2,00 3,00 114,00")), /Colunas/);
  assert.throws(() => parseThomazInadimplentes(sample.replace("Total 100,00", "13/03/26 04/2026 195 84448 100,00 5,00 2,00 3,00 4,00 114,00\nTotal 100,00")), /duplicado/);

  const currentYear = anoCorrenteImportacao();
  const output = buildPreviewFromRecibos({ origem: "Thomaz Multi", filename: "teste.pdf", recibos: receipts.map((r) => ({ ...r, vencimento: r.vencimento.replace("2026", String(currentYear)) })) });
  assert.ok(output.ok);
  const workbook = XLSX.read(Buffer.from(output.preview.xlsxBase64, "base64"));
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[workbook.SheetNames[0]]);
  assert.equal(rows[0].competencia, "04/2026");
  assert.equal(rows[0].unidade, "000023");
  assert.equal(rows[0].situacao_origem, "juridico");
  assert.equal(rows[0]["total do recibo"], 114);
  assert.match(output.preview.csv, /04\/2026/);

  const filename = process.argv[2];
  if (filename) {
    const buffer = readFileSync(filename);
    const full = parseThomazInadimplentes(await extractPdfVisualText(buffer));
    assert.equal(full.length, 139);
    assert.equal(new Set(full.map((r) => `${r.bloco}/${r.unidade}`)).size, 58);
    assert.equal(full.reduce((sum, r) => sum + Math.round(r.valorPrincipal * 100), 0), 14971882);
    assert.equal(full.reduce((sum, r) => sum + Math.round(r.valorTotal * 100), 0), 16053603);
    const result = await parseRelatorioBuffer({ buffer, filename, tipoConversao: "cobrancas", condominioCnpj: "12.345.678/0001-90" });
    if (result.ok === false) throw new Error(result.error);
    assert.equal(result.preview.padraoDetectado?.id, "thomaz-multi-inadimplentes-cobrancas-v1");
    assert.equal(result.preview.cobrancasRankingMensal?.length, 139);
    if (currentYear === 2026) {
      assert.equal(result.preview.totalParcelas, 117);
      assert.equal(Math.round(result.preview.valorTotal * 100), 12889357);
      const book = XLSX.read(Buffer.from(result.preview.xlsxBase64, "base64"));
      const exported = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets[book.SheetNames[0]]);
      assert.equal(exported.length, 117);
      assert.ok(exported.every((r) => r.condominio_cnpj === "12.345.678/0001-90"));
      assert.equal(exported.find((r) => r.unidade === "000037" && r.bloco === "1")?.competencia, "04/2026");
    }
    console.log("PDF real: 139 recibos, 58 unidades, principal R$ 149.718,82 e total R$ 160.536,03 conferidos.");
  }
  console.log("Thomaz Multi: detecção, encargos, quebras de página, competência, totais, rejeições e exportação validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
