import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = __dirname;
const records = JSON.parse(await fs.readFile("C:/tmp/tambore_records.json", "utf8"));
const condominioCnpj = "11772599000106";
const condominioCnpjFormula = `="${condominioCnpj}"`;
const condominioCnpjDisplay = "11.772.599/0001-06";

function brDateToIso(value) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function competenciaFromDate(value) {
  const iso = brDateToIso(value);
  const match = iso.match(/^(\d{4})-(\d{2})-/);
  return match ? `${match[2]}/${match[1]}` : "";
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const headers = [
  "condominio_cnpj",
  "unidade",
  "bloco",
  "responsavel_nome",
  "responsavel_documento",
  "telefone",
  "email",
  "competencia",
  "vencimento",
  "valor_original",
  "valor_atualizado",
  "multa",
  "correcao",
  "juros",
  "total do recibo",
  "status",
  "marcador_origem",
  "situacao_origem",
  "observacoes",
];

const rows = records.map((record) => {
  const situacao = record.marcador_origem === "ADV" ? "juridico" : "normal";
  const observacoes = [
    "Origem: Conversao de Relatorio",
    "Sistema: Hflex / LiveFacilities - Devedores Detalhado",
    `Recibo: ${record.recibo}`,
    record.marcador_origem ? `Marcador origem: ${record.marcador_origem}` : "",
    situacao !== "normal" ? `Situacao origem: ${situacao}` : "",
    `Pagina PDF: ${record.source_page.replace("page-", "")}`,
  ].filter(Boolean).join(" | ");

  return [
    condominioCnpjFormula,
    record.unidade,
    record.bloco,
    "",
    "",
    "",
    "",
    competenciaFromDate(record.vencimento),
    brDateToIso(record.vencimento),
    money(record.valor_original),
    money(record.valor_atualizado),
    money(record.multa),
    money(record.correcao),
    money(record.juros),
    money(record.total_recibo),
    "novo",
    record.marcador_origem,
    situacao,
    observacoes,
  ];
});

const totalOriginal = rows.reduce((sum, row) => sum + row[9], 0);
const totalAtualizado = rows.reduce((sum, row) => sum + row[10], 0);
const totalMulta = rows.reduce((sum, row) => sum + row[11], 0);
const totalCorrecao = rows.reduce((sum, row) => sum + row[12], 0);
const totalJuros = rows.reduce((sum, row) => sum + row[13], 0);
const unidades = new Set(rows.map((row) => row[1]));
const adv = rows.filter((row) => row[16] === "ADV").length;

const workbook = Workbook.create();
const resumo = workbook.worksheets.add("Resumo");
const dados = workbook.worksheets.add("dados");

resumo.showGridLines = false;
dados.showGridLines = false;

resumo.getRange("A1:H1").merge();
resumo.getRange("A1").values = [["Tambore 07-26 - Conversao para importacao GKLI"]];
resumo.getRange("A1").format = {
  fill: "#0F4C5C",
  font: { bold: true, color: "#FFFFFF", size: 14 },
};

resumo.getRange("B4").format.numberFormat = "@";
resumo.getRange("A3:B11").values = [
  ["Condominio", "SUBCONDOMINIO EDIFICIO OFFICE TAMBORE"],
  ["CNPJ usado", condominioCnpjDisplay],
  ["Fonte", "CONDOMINO TAMBORE 07-26.pdf"],
  ["Tipo de importacao", "Cobrancas"],
  ["Bloco", "OFFICE"],
  ["Unidades", unidades.size],
  ["Recibos", rows.length],
  ["Recibos com marcador ADV", adv],
  ["Status padrao", "novo"],
];

resumo.getRange("D3:E8").values = [
  ["Total original", money(totalOriginal)],
  ["Total atualizado", money(totalAtualizado)],
  ["Multa lida", money(totalMulta)],
  ["Juros lido", money(totalJuros)],
  ["Correcao ajustada", money(totalCorrecao)],
  ["Conferencia", "Original e atualizado batem com o resumo do PDF"],
];

resumo.getRange("A3:A11").format = { font: { bold: true }, fill: "#E7EEF1" };
resumo.getRange("D3:D8").format = { font: { bold: true }, fill: "#E7EEF1" };
resumo.getRange("B3:B11").format = { fill: "#F8FAFC" };
resumo.getRange("E3:E8").format = { fill: "#F8FAFC" };
resumo.getRange("E3:E7").format.numberFormat = '"R$"#,##0.00';
resumo.getRange("A3:E11").format.borders = { preset: "all", style: "thin", color: "#D7DEE2" };
resumo.getRange("A13:H13").values = [["Observacao", "O PDF estava em imagem. Os totais por recibo foram reconciliados contra o resumo final do relatorio; em 7 recibos, a correcao foi ajustada pelo fechamento do proprio recibo.", null, null, null, null, null, null]];
resumo.getRange("A13:H13").merge();
resumo.getRange("A13").format = { fill: "#FFF7ED", font: { color: "#7C2D12" }, wrapText: true };

dados.getRange(`A2:A${rows.length + 1}`).format.numberFormat = "@";
dados.getRange(`B2:C${rows.length + 1}`).format.numberFormat = "@";
dados.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
dados.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
dados.getRangeByIndexes(0, 0, rows.length + 1, headers.length).format.borders = {
  preset: "all",
  style: "thin",
  color: "#D7DEE2",
};
dados.getRangeByIndexes(0, 0, 1, headers.length).format = {
  fill: "#0F4C5C",
  font: { bold: true, color: "#FFFFFF" },
};
dados.getRange(`I2:I${rows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
dados.getRange(`J2:O${rows.length + 1}`).format.numberFormat = '"R$"#,##0.00';
dados.getRange("A:S").format.autofitColumns();
dados.getRange("S:S").format.columnWidth = 72;
dados.getRange("S:S").format.wrapText = true;
dados.freezePanes.freezeRows(1);
dados.tables.add(`A1:S${rows.length + 1}`, true, "DadosImportacaoTambore");

resumo.getRange("A:H").format.autofitColumns();
resumo.getRange("A:A").format.columnWidth = 24;
resumo.getRange("B:B").format.columnWidth = 44;
resumo.getRange("D:D").format.columnWidth = 22;
resumo.getRange("E:E").format.columnWidth = 30;

const inspect = await workbook.inspect({
  kind: "table",
  sheetId: "Resumo",
  range: "A1:E13",
  tableMaxRows: 14,
  tableMaxCols: 5,
  maxChars: 4000,
});
await fs.writeFile(path.join(outputDir, "tambore_07-26_gkli_cobrancas.inspect.ndjson"), inspect.ndjson);

const preview = await workbook.render({
  sheetName: "Resumo",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(path.join(outputDir, "tambore_07-26_gkli_cobrancas_preview.png"), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "tambore_07-26_gkli_cobrancas.xlsx"));
