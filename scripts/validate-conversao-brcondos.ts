import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { detectBrcondosResponsaveis, parseBrcondosResponsaveis } from "../features/conversao-relatorio/server/brcondos-responsaveis";
import { parseRelatorioBuffer } from "../features/conversao-relatorio/server/parse-relatorio-buffer";

const header = "CONDOMÍNIO EXEMPLO\n12.345.678/0001-90\nmoradores\nUNIDADE";
const text = `${header}
Número: 01
Proprietário: ANA EXEMPLO
Endereço: Rua Exemplo, 123Complemento:
Bairro: CentroCEP: 12345-678 Cidade: CidadeEstado: SP
Telefone: (19) 3333-4444Celular: (19) 99999-8888
E-Mail: ana@example.com;outro@example.com
Número: 02
Proprietário: JOÃO EXEMPLO
Endereço: Rua Exemplo, 123Complemento:

Telefone:Celular: (00)0000-0000
E-Mail: joao@example.com
Número: 01
Morador/Locatário: MARIA EXEMPLO
Endereço: Rua Exemplo, 123Complemento:
Celular:
E-Mail: maria@example.com`;

async function main() {
  assert.equal(detectBrcondosResponsaveis(text)?.condominioDetectado, "CONDOMÍNIO EXEMPLO");
  assert.equal(detectBrcondosResponsaveis(text.replace("moradores", "Devedores")), null);
  assert.equal(detectBrcondosResponsaveis("BRCondos Lista de Moradores"), null);
  const records = parseBrcondosResponsaveis(text);
  assert.equal(records.length, 3);
  assert.equal(records[0].identificacao, "01");
  assert.equal(records[0].telefone, "1933334444 | 19999998888");
  assert.equal(records[0].email, "ana@example.com | outro@example.com");
  assert.equal(records[1].telefone, "");
  assert.equal(records[2].telefone, "");
  assert.equal(records[2].email, "maria@example.com");
  assert.equal(records[2].tipoResponsavel, "inquilino");
  assert.ok(records.every((record) => record.responsavelDocumento === ""));
  const incomplete = parseBrcondosResponsaveis(text.replace("Proprietário: ANA EXEMPLO", "Proprietário:"));
  assert.equal(incomplete.length, 3);
  assert.equal(incomplete[0].responsavelNome, "");

  // Optional local reference; no personal data is checked into the repository.
  const referencePath = process.argv[2];
  if (referencePath) {
    const actual = await parseRelatorioBuffer({
      buffer: readFileSync(referencePath), filename: "referencia.pdf", tipoConversao: "unidades", condominioCnpj: "98765432000100",
    });
    if (actual.ok === false) throw new Error(actual.error);
    const workbook = XLSX.read(Buffer.from(actual.preview.xlsxBase64, "base64"));
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.DADOS);
    assert.equal(rows.length, 30);
    assert.equal(rows[0].condominio_cnpj, "98765432000100");
    assert.equal(rows[0].identificacao, "01");
    assert.equal(rows[27].tipo_responsavel, "inquilino");
    assert.equal(rows[0].responsavel_documento, "");
    assert.equal(actual.preview.padraoDetectado?.id, "brcondos-lista-moradores-responsaveis-v1");
    const units = actual.preview.unidades;
    assert.equal(units.length, 30);
    assert.equal(new Set(units.map((unit) => unit.identificacao)).size, 27);
    assert.equal(units.filter((unit) => unit.tipoResponsavel === "proprietario").length, 27);
    assert.equal(units.filter((unit) => unit.tipoResponsavel === "inquilino").length, 3);
    assert.ok(units.every((unit) => unit.email && unit.responsavelNome && !unit.responsavelDocumento));
    assert.equal(units.find((unit) => unit.identificacao === "23")?.telefone, "");
    assert.equal(units.find((unit) => unit.identificacao === "26")?.telefone.length, 10);
    assert.ok(units.find((unit) => unit.identificacao === "06")?.telefone);
    assert.ok(units.find((unit) => unit.identificacao === "13")?.email);
    assert.equal(actual.preview.inconsistencias.length, 30); // Missing personal documents only.
    console.log("PDF de referência: 30 responsáveis, 27 unidades, 27 proprietários e 3 moradores/locatários.");
  }
  console.log("Conversão BRCondos validada com sucesso.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
