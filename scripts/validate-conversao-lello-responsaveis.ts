import assert from "node:assert/strict";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { detectLelloResponsaveis, parseLelloResponsaveis } from "../features/conversao-relatorio/server/lello-responsaveis";
import { parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";
import { parseXlsx } from "../features/importacoes/engine/xlsx-parser";
import { normalizarContatosResponsavel } from "../features/importacoes/telefones";

async function main() {
  const person = `Condômino\nNome PESSOA TESTE Tipo de pessoa: Física\nCPF 123.456.789-00 RG\nCNPJ % de participação 50,00\nEntrega de correspondência Prédio E-mail teste@example.com\nEnviar para o Dataflex? Sim E-mail boleto outro@example.com\nEndereço RUA TESTE, 1\nCEP 00000-000 Telefone 1133334444\nTelefone A/C 1144445555 Celular A/C (11) 99999-8888`;
  const header = `Dados do condomínio\nReferência 1-2 Nome TESTE\nhttps://portal.lellocondominios.com.br/gpseg2/index.action\nBloco Unidade\nTORRE A A00011\n`;
  const text = header + person + "\n02/10/2026, 16:52 Gpseg2\nhttps://portal.lellocondominios.com.br/gpseg2/index.action1/2\n" + person.replace("PESSOA TESTE", "OUTRA PESSOA").replace("CPF 123.456.789-00 RG", "CPF RG").replace("CNPJ %", "CNPJ 12.345.678/0001-99 %");
  assert.equal(detectLelloResponsaveis(text)?.condominioDetectado, "TESTE");
  assert.equal(detectLelloResponsaveis(text.replaceAll("portal.lellocondominios.com.br", "outro.example.com")), null);
  const parsed = parseLelloResponsaveis(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].identificacao, "A00011");
  assert.equal(parsed[0].bloco, "TORRE A");
  assert.equal(parsed[0].telefone, "1133334444 | 1144445555 | 11999998888");
  assert.equal(parsed[0].email, "teste@example.com | outro@example.com");
  assert.equal(parsed[1].responsavelDocumento, "12345678000199");
  assert.match(parsed[0].observacoes, /RUA TESTE, 1/);
  assert.throws(() => parseLelloResponsaveis(text.replace("Nome PESSOA TESTE", "Nome")), /sem nome/);
  const file = process.argv[2];
  if (file) {
    const result = await parseRelatorioBuffer({ buffer: fs.readFileSync(file), filename: "cadastro-lello.pdf", tipoConversao: "unidades" });
    if (result.ok === false) throw new Error(result.error);
    const preview = result.preview;
    assert.equal(preview.padraoDetectado?.id, "lello-enderecamento-responsaveis-v1");
    assert.equal(preview.padraoDetectado?.condominioDetectado, "VILLA NATURA");
    assert.equal(preview.unidades.length, 271);
    assert.equal(new Set(preview.unidades.map((row) => `${row.bloco}|${row.identificacao}`)).size, 208);
    assert.equal(preview.unidades[0].telefone, "5511930310206");
    assert.equal(preview.unidades[0].celular, "5511930310206");
    assert.equal(preview.unidades[0].telefone_fixo, "551155481079");
    assert.equal(preview.unidades.filter((row) => row.identificacao === "A00031").length, 2);
    const workbook = XLSX.read(Buffer.from(preview.xlsxBase64, "base64"));
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.DADOS);
    assert.equal(rows.length, 271);
    assert.equal((rows[0] as Record<string, string>).telefone_fixo, "551155481079");
    const bytes = Uint8Array.from(Buffer.from(preview.xlsxBase64, "base64"));
    const imported = parseXlsx("responsaveis.xlsx", bytes.buffer);
    for (const [index, row] of imported.rows.entries()) {
      const contato = normalizarContatosResponsavel(row.payload);
      for (const field of ["celular", "telefone_fixo", "telefone_outros"] as const) {
        assert.equal(contato[field] ?? "", preview.unidades[index][field] ?? "");
      }
    }
    console.log(JSON.stringify({ unidades: 208, responsaveis: rows.length, inconsistencias: preview.inconsistencias.length }));
  }
  console.log("Cadastro Lello validado.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
