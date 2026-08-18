import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Gekali/Downloads/gkli-condominios-com-administradoras.xlsx";
const outputDir = "C:/Users/Gekali/gkli-cob/outputs/condominios-agentes-20260813";
const outputPath = `${outputDir}/gkli-condominios-com-administradoras-e-agentes.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

if (process.argv.includes("--inspect")) {
  console.log((await workbook.inspect({
    kind: "workbook,sheet,table,region",
    maxChars: 12000,
    tableMaxRows: 80,
    tableMaxCols: 15,
  })).ndjson);
  const sheet = workbook.worksheets.getItemAt(0);
  await fs.mkdir(outputDir, { recursive: true });
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/antes.png`, new Uint8Array(await preview.arrayBuffer()));
  process.exit(0);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const agentCondominiums = new Map([
  ["CLOCK VILA ROMANA", "Sim — BBZ"],
  ["COND. VIVAZ ESTACAO VILA PRUDENTE", "Sim — BBZ"],
  ["CONDOMINIO DOMO RESIDENCIAL LIFE", "Sim — BBZ"],
  ["CONDOMINIO EDIFICIO ESTACAO GABRIELE", "Sim — BBZ"],
  ["CONDOMINIO EDIFICIO VIVAZ ESTACAO VILA PRUDENTE", "Sim — BBZ"],
  ["CONDOMINIO ELO & ELO DUO CAMINHOS DA LAPA SETOR 3 RESIDENCIAL TORRE B", "Sim — BBZ"],
  ["CONDOMINIO HARMONIA 1040 - ESCRITORIOS", "Sim — BBZ"],
  ["CONDOMINIO HARMONIA 1040 - LOJAS", "Sim — BBZ"],
  ["CONDOMINIO PANORAMA VILA ROMANA", "Sim — BBZ"],
  ["ELO CAMINHOS DA LAPA TORRE A SETOR RESIDENCIAL 2", "Sim — BBZ"],
  ["EDIFICIO PARQUE DOS JEQUITIBAS", "Sim — Manager"],
  ["CONDOMINIO SQUARE GUARULHOS", "Sim — Villágua"],
]);

const sheet = workbook.worksheets.getItemAt(0);
const used = sheet.getUsedRange();
const values = used.values;
const headers = values[0].map(normalize);
const nameColumn = headers.findIndex((h) => h.includes("CONDOMINIO"));
if (nameColumn < 0) throw new Error("Coluna de condomínio não encontrada.");

const agentColumn = values[0].length;
const lastRow = values.length;
const columnLetter = String.fromCharCode(65 + agentColumn);
const sourceHeader = sheet.getRangeByIndexes(0, Math.max(0, agentColumn - 1), 1, 1);
sheet.getRange(`${columnLetter}1`).copyFrom(sourceHeader, "formats");
const sourceBody = sheet.getRangeByIndexes(1, Math.max(0, agentColumn - 1), lastRow - 1, 1);
sheet.getRange(`${columnLetter}2:${columnLetter}${lastRow}`).copyFrom(sourceBody, "formats");
sheet.getRange(`${columnLetter}1`).values = [["Roteiro automatizado"]];

const agentValues = values.slice(1).map((row) => [agentCondominiums.get(normalize(row[nameColumn])) ?? "Não"]);
sheet.getRange(`${columnLetter}2:${columnLetter}${lastRow}`).values = agentValues;
sheet.getRange(`${columnLetter}1:${columnLetter}${lastRow}`).format.columnWidth = 22;

const tableItems = sheet.tables.items;
if (tableItems.length === 1) {
  const oldTable = tableItems[0];
  const oldName = oldTable.name;
  const oldStyle = oldTable.style;
  oldTable.delete();
  const table = sheet.tables.add(`A1:${columnLetter}${lastRow}`, true, oldName);
  table.style = oldStyle;
}

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const check = await workbook.inspect({
  kind: "table",
  range: `A1:${columnLetter}${Math.min(lastRow, 80)}`,
  include: "values,formulas",
  tableMaxRows: 80,
  tableMaxCols: agentColumn + 1,
  maxChars: 18000,
});
console.log(check.ndjson);
console.log((await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
})).ndjson);

const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/depois.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(JSON.stringify({ outputPath, totalRows: lastRow - 1, withAgent: agentValues.filter(([v]) => v.startsWith("Sim")).length }));
