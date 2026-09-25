import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseRelatorioBuffer, parseSuperlogicaUnidadesPdf } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { anoCorrenteImportacao } from "../features/importacoes/recorte-cobrancas";
import { detectHausyInadimplencia, parseHausyInadimplencia } from "../features/conversao-relatorio/server/hausy-inadimplencia";
import { detectSuperlogicaSimplificada, parseSimplificadaRows } from "../features/conversao-relatorio/server/superlogica-simplificada";

const debt = `Inadimplência
Posição em: 24/09/2026
Total de unidades inadimplentes: 1
Condomínio: EXEMPLO
Valor Original Valor Principal
Bloco A - Unidade 000031 : PESSOA EXEMPLO
12345678 10/09/2026 123 111 IPTU 4/6 100,00 100,00 2,00 0,00 1,00 103,00
112 CONDOMÍNIO 200,00 200,00 4,00 0,00 2,00 206,00
Total do recibo: 300,00 300,00 6,00 0,00 3,00 309,00
Total da unidade: 300,00 300,00 6,00 0,00 3,00 309,00
Total acumulado: R$ 300,00 R$ 300,00 R$ 6,00 R$ 0,00 R$ 3,00 R$ 309,00`;

async function main() {
  const fullText = `Bloco: AUnidade:Código do cliente: 123456000001 - ANA EXEMPLO
Dados pessoais
CPF: 123.456.789-00
Telefone/e-mail do cliente
E-mail - ana@example.com.brE-mail - contato@example.com
Dados gerais
Dados do pagadorTipo de pessoa: FísicaCPF: 123.456.789-00
Emitido em 01/01/2026
Relatório de Unidades - Completo
Condominio: 1 - EXEMPLO
CNPJ: 12.345.678/0001-90
Bloco: AUnidade:Código do cliente: 123456000001 - ANA EXEMPLO
Rateio/frações`;
  const complete = parseSuperlogicaUnidadesPdf(fullText);
  assert.equal(complete.length, 1);
  assert.equal(complete[0].responsavelDocumento, "123.456.789-00");
  assert.equal(complete[0].email, "ana@example.com.br");
  assert.match(complete[0].observacoes, /contato@example.com/);
  assert.equal(parseSuperlogicaUnidadesPdf(fullText.replaceAll("CPF: 123.456.789-00", "CPF:"))[0].responsavelDocumento, "");
  assert.ok(detectHausyInadimplencia(debt));
  assert.equal(detectHausyInadimplencia(debt.replace("Valor Original", "Outra coluna")), null);
  const recibos = parseHausyInadimplencia(debt);
  assert.equal(recibos.length, 1);
  assert.equal(recibos[0].valorPrincipal, 300);
  assert.equal(recibos[0].valorTotal, 309);
  assert.equal(recibos[0].recibo, "12345678");
  assert.equal(recibos[0].unidade, "000031");
  assert.match(recibos[0].detalhesOrigem ?? "", /IPTU 4\/6/);
  assert.throws(() => parseHausyInadimplencia(debt.replace("100,00 100,00", "101,00 100,00")), /Composição divergente/);
  assert.throws(() => parseHausyInadimplencia(debt.replace("R$ 309,00", "R$ 310,00")), /Total acumulado/);
  assert.throws(() => parseHausyInadimplencia(debt.replace("inadimplentes: 1", "inadimplentes: 2")), /Quantidade/);
  assert.throws(() => parseHausyInadimplencia(debt.replace("10/09/2026", "31/09/2026")), /Vencimento/);
  const simplified = parseSimplificadaRows([
    { bloco: "A", unidade: "000001", cliente: "123456", nome: "ANA EXEMPLO", contatos: "Cliente: Celular: 11 99999-0000" },
    { bloco: "", unidade: "", cliente: "", nome: "", contatos: "E-mail: ana@example.com" },
    // Continuation at the top of another page, before the next unit starts.
    { bloco: "", unidade: "", cliente: "", nome: "", contatos: "E-mail: contato@example.com" },
    { bloco: "VG", unidade: "VG0018", cliente: "123456", nome: "ANA EXEMPLO", contatos: "E-mail: garagem@example.com" },
  ], 2);
  assert.equal(simplified[0].email, "ana@example.com | contato@example.com");
  assert.equal(simplified[1].email, "garagem@example.com");
  assert.equal(simplified[0].telefone, "11999990000");
  assert.equal(simplified[1].identificacao, "VG0018");
  assert.equal(simplified[0].responsavelDocumento, "");
  assert.throws(() => parseSimplificadaRows([], 1), /Quantidade/);
  assert.equal(detectSuperlogicaSimplificada("Relatório de Unidades - Completo"), null);

  const directory = process.argv[2];
  if (directory) {
    const results = [];
    for (const filename of ["365.pdf", "RelatorioUnidades (4) (1).pdf", "RelatorioUnidades (8).pdf"]) {
      const result = await parseRelatorioBuffer({
        buffer: readFileSync(`${directory}/${filename}`), filename,
        tipoConversao: filename === "365.pdf" ? "cobrancas" : "unidades", condominioCnpj: "64.934.001/0001-96",
      });
      if (result.ok === false) throw new Error(result.error);
      results.push(result.preview);
      const workbook = XLSX.read(Buffer.from(result.preview.xlsxBase64, "base64"));
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[workbook.SheetNames[0]]);
      assert.equal(rows.length, filename === "365.pdf" ? (anoCorrenteImportacao() === 2026 ? 1 : 0) : 63);
      assert.ok(rows.every((row) => row.condominio_cnpj === "64.934.001/0001-96"));
    }
    const record = results[0].cobrancasRankingMensal?.[0];
    assert.equal(record?.recibo, "23091270");
    assert.equal(record?.valorPrincipal, 4907.38);
    assert.equal(record?.multa, 98.15);
    assert.equal(record?.valorTotal, 5005.53);
    const simple = results[1].unidades;
    const full = results[2].unidades;
    assert.equal(new Set(simple.map((item) => `${item.bloco}/${item.identificacao}`)).size, 63);
    assert.equal(new Set(full.map((item) => `${item.bloco}/${item.identificacao}`)).size, 63);
    assert.ok(simple.every((item) => !item.responsavelDocumento));
    assert.ok(full.every((item) => item.responsavelDocumento && item.responsavelDocumento !== "64.934.001/0001-96"));
    for (const item of simple) {
      const other = full.find((candidate) => candidate.bloco === item.bloco && candidate.identificacao === item.identificacao);
      assert.ok(other);
      assert.equal(other.responsavelNome, item.responsavelNome);
      const fullEmails = [...new Set(`${other.email} ${other.observacoes}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])].sort();
      assert.deepEqual(item.email.split(" | ").filter(Boolean).sort(), fullEmails);
    }
    const continuation = simple.find((item) => item.bloco === "B" && item.identificacao === "000034");
    assert.equal(continuation?.email.split(" | ").length, 3);
    assert.equal(continuation?.telefone.split(" | ").length, 7);
    assert.equal(results[2].inconsistencias.length, 0);
    console.log("PDFs reais: 1 recibo de R$ 5.005,53; 63 cadastros em cada relatório, nomes/unidades/e-mails conferidos.");
  }
  console.log("Hausy e relação simplificada: composição, totais, contatos e XLSX validados.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
