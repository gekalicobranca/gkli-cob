import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseRelatorioBuffer, parseSuperlogicaPendentesCobrancasPdf } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

const text = `Bloco: 0 Unidade: SU0001 EMPRESA EXEMPLO CNPJ: 12.345.678/0001-90
1234567810/09/20262614821COTA R$100,00100,002,000,000,00102,00AE
Bloco: 0 Unidade: SU0001 EMPRESA EXEMPLO CNPJ: 12.345.678/0001-90
1234567810/09/20262614822CONTA R$50,0050,001,000,000,0051,00AE
Total do recibo:150,00150,003,000,000,00153,00R$
12345679 J 10/08/2026 260702 1COTA R$100,00100,002,000,001,00103,00
Total do recibo:100,00100,002,000,001,00103,00R$
1234568010/09/20262614821COTA R$100,00100,002,000,000,00102,00
Total do recibo:100,00100,002,000,000,00102,00R$
Total da Unidade:350,00350,007,000,001,00358,00R$
Agenda de contatos da unidade
E-mail: locatario@example.com - INQUILINO
Bloco: 0 Unidade: SU0001 EMPRESA EXEMPLO CNPJ: 12.345.678/0001-90
Agenda de contatos do cliente
Celular: (11) 99999-0000E-mail: proprietario@example.com
Quantidade de Unidades inadimplentes do Condomínio: 1Total:350,00350,007,000,001,00358,00`;

async function main() {
  const records = parseSuperlogicaPendentesCobrancasPdf(text);
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((item) => item.valorTotal), [153, 103, 102]);
  assert.deepEqual(records.map((item) => item.marcadorOrigem), ["AE", "J", undefined]);
  assert.deepEqual(records.map((item) => item.situacaoOrigem), ["acordo_extrajudicial", "juridico", "normal"]);
  assert.ok(records.every((item) => item.responsavelDocumento === "12.345.678/0001-90" && item.email === "proprietario@example.com"));
  assert.ok(records.every((item) => item.telefone?.replace(/\D/g, "") === "11999990000"));
  assert.ok(records.every((item) => item.detalhesOrigem?.includes("locatario@example.com - INQUILINO")));
  assert.throws(() => parseSuperlogicaPendentesCobrancasPdf(text.replace("Total da Unidade:350,00", "Total da Unidade:351,00")), /totais divergentes/);
  assert.throws(() => parseSuperlogicaPendentesCobrancasPdf(text.replace("1Total:350,00", "1Total:351,00")), /total geral/);
  assert.throws(() => parseSuperlogicaPendentesCobrancasPdf(text.replace("1Total:", "2Total:")), /quantidade de unidades/);
  for (const marker of ["A", "AE", "AJ", "J", "D", "B", "P"]) {
    assert.equal(parseSuperlogicaPendentesCobrancasPdf(text.replaceAll("AE", marker))[0].marcadorOrigem, marker);
  }

  if (process.argv[2]) {
    const result = await parseRelatorioBuffer({
      buffer: readFileSync(process.argv[2]), filename: "referencia.pdf", tipoConversao: "cobrancas", condominioCnpj: "52.151.457/0003-62",
    });
    if (result.ok === false) throw new Error(result.error);
    const all = result.preview.cobrancasRankingMensal ?? [];
    assert.equal(all.length, 28);
    assert.equal(new Set(all.map((item) => item.unidade)).size, 15);
    assert.equal(new Set(all.map((item) => item.recibo)).size, 28);
    const sums = (field: "valorPrincipal" | "multa" | "correcao" | "juros" | "valorTotal") => all.reduce((sum, item) => sum + Math.round((item[field] ?? 0) * 100), 0);
    assert.deepEqual([sums("valorPrincipal"), sums("multa"), sums("correcao"), sums("juros"), sums("valorTotal")], [2004384, 40091, 3470, 25780, 2073725]);
    assert.equal(all.filter((item) => item.marcadorOrigem === "AE").length, 6);
    assert.equal(all.filter((item) => item.marcadorOrigem === "J").length, 9);
    assert.equal(all.filter((item) => !item.marcadorOrigem).length, 13);
    assert.ok(all.every((item) => item.responsavelDocumento && item.telefone && item.email));
    assert.equal(all.find((item) => item.recibo === "15715409")?.valorTotal, 690.36);
    assert.equal(all.find((item) => item.recibo === "15896014")?.valorTotal, 794.49);
    const workbook = XLSX.read(Buffer.from(result.preview.xlsxBase64, "base64"));
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets.dados);
    assert.equal(rows.length, result.preview.totalParcelas);
    assert.ok(rows.every((row) => row.condominio_cnpj === "52.151.457/0003-62" && row.responsavel_documento && row.telefone && row.email));
    console.log("Square Garden Studios: 28 recibos, 15 unidades, R$ 20.737,25; 6 AE, 9 J e 13 normais; documentos e contatos completos.");
  }
  console.log("Superlógica analítica: marcadores, continuação de páginas, cadastros, contatos e totais validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
