import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseRelatorioBuffer, buildPreviewFromRecibos } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { detectSuperlogicaResumida, parseSuperlogicaResumida } from "../features/conversao-relatorio/server/superlogica-resumida";
import { anoCorrenteImportacao } from "../features/importacoes/recorte-cobrancas";

const year = anoCorrenteImportacao();
const fixture = `Relação Resumida de Pendentes
Bloco Unidade Nome Recibo Vencto. Emissão Valor Total
Condomínio: 1000 - EXEMPLO
01 000043 ANA EXEMPLO 100001 J 10/01/${year - 1} 4300 100,00
Emitido em 01/09/${year} - Página 1 de 2
Relação Resumida de Pendentes
Bloco Unidade Nome Recibo Vencto. Emissão Valor Total
Condomínio: 1000 - EXEMPLO
01 000043 ANA EXEMPLO 100002 A 10/02/${year} 4301 200,00
100003 10/03/${year} 4302 300,00 600,00
VG VG1558 PESSOA EXEMPLO 100004 AJ 10/04/${year} 4303 10,00 10,00
Quantidade de Unidades inadimplentes do Condomínio: 2 Total: 610,00`;

async function main() {
  assert.equal(detectSuperlogicaResumida(fixture)?.condominioDetectado, "EXEMPLO");
  assert.equal(detectSuperlogicaResumida(fixture.replaceAll("Resumida", "Analítica")), null);
  const records = parseSuperlogicaResumida(fixture);
  assert.equal(records.length, 4);
  assert.deepEqual(records.map((record) => record.valorTotal), [100, 200, 300, 10]);
  assert.deepEqual(records.map((record) => record.situacaoOrigem), ["juridico", "acordo", "normal", "acordo_judicial"]);
  assert.equal(records[1].unidade, "000043");
  assert.equal(records[3].unidade, "VG1558");
  assert.equal(records[3].bloco, "VG");
  for (const [marker, situation] of [["AE", "acordo_extrajudicial"], ["D", "deposito_identificado"], ["B", "boleto_bancario"], ["P", "protesto"]]) {
    assert.equal(parseSuperlogicaResumida(fixture.replace("100004 AJ", `100004 ${marker}`))[3].situacaoOrigem, situation);
  }
  assert.throws(() => parseSuperlogicaResumida(fixture.replace("600,00", "601,00")), /Subtotal divergente/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace("610,00", "611,00")), /Total geral/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace("Condomínio: 2 Total", "Condomínio: 3 Total")), /Quantidade/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace("100003", "100002")), /duplicado/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace("100004 AJ", "100004 X")), /Marcador desconhecido/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace(`10/02/${year}`, `31/02/${year}`)), /Vencimento/);
  assert.throws(() => parseSuperlogicaResumida(fixture.replace(" 600,00", "")), /Subtotal ausente/);
  const preview = buildPreviewFromRecibos({ filename: "teste.pdf", origem: "Superlógica", recibos: records, padraoDetectado: detectSuperlogicaResumida(fixture)! });
  if (preview.ok === false) throw new Error(preview.error);
  assert.equal(preview.preview.totalParcelas, 3);
  assert.equal(preview.preview.valorTotal, 510);
  const book = XLSX.read(Buffer.from(preview.preview.xlsxBase64, "base64"));
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(book.Sheets.dados);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].valor_original, 200);
  assert.equal(rows[0].valor_atualizado, 200);
  assert.equal(rows[0].situacao_origem, "acordo");
  assert.equal(rows[1].situacao_origem, "normal");
  assert.equal(rows[0].bloco, "01");
  assert.equal(rows[0].unidade, "000043");

  if (process.argv[2]) {
    const result = await parseRelatorioBuffer({
      buffer: readFileSync(process.argv[2]), filename: "referencia.pdf", tipoConversao: "cobrancas",
    });
    if (result.ok === false) throw new Error(result.error);
    const all = result.preview.cobrancasRankingMensal ?? [];
    assert.equal(all.length, 302);
    assert.equal(new Set(all.map((record) => `${record.bloco}/${record.unidade}`)).size, 47);
    assert.equal(all.reduce((sum, record) => sum + Math.round(record.valorTotal * 100), 0), 33420827);
    assert.equal(all.find((record) => record.recibo === "216650")?.unidade, "00DOMO");
    assert.equal(all.find((record) => record.recibo === "216942")?.bloco, "LOC");
    assert.equal(all.find((record) => record.recibo === "229669")?.unidade, "VG1558");
    assert.equal(all.find((record) => record.recibo === "229038")?.situacaoOrigem, "normal");
    assert.equal(all.find((record) => record.recibo === "216888")?.valorTotal, 1130.72);
    if (year === 2026) {
      assert.equal(result.preview.totalParcelas, 116);
      assert.equal(Math.round(result.preview.valorTotal * 100), 15411556);
      assert.equal(new Set(result.preview.cobrancas.map((record) => `${record.bloco}/${record.unidade}`)).size, 40);
    }
    console.log("PDF real: 302 recibos / 47 unidades / R$ 334.208,27. Recorte 2026: 116 recibos / 40 unidades / R$ 154.115,56.");
  }
  console.log("Pendentes resumidos: continuidades, marcadores, subtotais, total e XLSX validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
