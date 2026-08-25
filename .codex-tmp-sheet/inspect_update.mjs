import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Gekali/gkli-cob/outputs/cronogramas_agosto_2026/lista_unica_cobrancas_cronogramas_agosto_2026.xlsx";
const mode = process.argv[2] || "inspect";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

if (mode === "inspect") {
  const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
  console.log(sheets.ndjson);
  const matches = await workbook.inspect({
    kind: "match",
    searchTerm: "SAFIRA|BEM MOEMA|VILLA NATURA|VERDANA",
    options: { useRegex: true, maxResults: 100 },
    summary: "linhas dos condomínios confirmados",
  });
  console.log(matches.ndjson);
  const summary = await workbook.inspect({ kind: "table", range: "Resumo!A1:H24", include: "values,formulas", tableMaxRows: 24, tableMaxCols: 8 });
  console.log(summary.ndjson);
  for (const range of ["'Lista única'!A1:Q50", "'Lista única'!A180:Q202", "Condomínios!A1:H65"]) {
    const detail = await workbook.inspect({ kind: "table", range, include: "values,formulas", tableMaxRows: 70, tableMaxCols: 17, maxChars: 30000 });
    console.log(detail.ndjson);
  }
  await fs.mkdir(".codex-tmp-sheet/previews-before", { recursive: true });
  for (const name of ["Resumo", "Lista única", "Condomínios", "Descartadas"]) {
    const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(`.codex-tmp-sheet/previews-before/${name.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
  }
}

if (mode === "edit") {
  const summarySheet = workbook.worksheets.getItem("Resumo");
  const listSheet = workbook.worksheets.getItem("Lista única");
  const condoSheet = workbook.worksheets.getItem("Condomínios");

  summarySheet.getRange("B5:B6").values = [[52], [11]];
  listSheet.getRange("I195:I198").values = [["Confirmado"], ["Confirmado"], ["Confirmado"], ["Confirmado"]];
  condoSheet.getRange("C61").values = [["Confirmado"]];

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
  });
  console.log(errors.ndjson);
  const summaryCheck = await workbook.inspect({ kind: "table", range: "Resumo!A3:B10", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 2 });
  console.log(summaryCheck.ndjson);
  const listCheck = await workbook.inspect({ kind: "table", range: "'Lista única'!G195:K198", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 5 });
  console.log(listCheck.ndjson);
  const condoCheck = await workbook.inspect({ kind: "table", range: "Condomínios!A61:H61", include: "values,formulas", tableMaxRows: 1, tableMaxCols: 8 });
  console.log(condoCheck.ndjson);

  await fs.mkdir(".codex-tmp-sheet/previews-after", { recursive: true });
  for (const name of ["Resumo", "Lista única", "Condomínios", "Descartadas"]) {
    const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(`.codex-tmp-sheet/previews-after/${name.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(inputPath);
}
