import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "C:/Users/Gekali/Downloads/financas_566011197239481.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
const sheet = workbook.worksheets.getItem("financas");

const rows = [39, 48, 54];
const result = {
  headers: sheet.getRange("U6:AE6").values[0],
  records: rows.map((row) => ({ row, values: sheet.getRange(`U${row}:AE${row}`).values[0] })),
};

process.stdout.write(JSON.stringify(result, null, 2));
