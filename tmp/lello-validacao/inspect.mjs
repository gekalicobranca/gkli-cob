import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const path = 'C:/Users/Gekali/Downloads/CotasInadimplentes_182.xlsx';
const input = await FileBlob.load(path);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 4000 });
console.log(sheets.ndjson);

const summary = await workbook.inspect({
  kind: 'workbook,sheet,table',
  maxChars: 16000,
  tableMaxRows: 12,
  tableMaxCols: 20,
  tableMaxCellChars: 180,
});
console.log(summary.ndjson);

const matches = await workbook.inspect({
  kind: 'match',
  searchTerm: '1103|001103|Bem Moema|BEM MOEMA',
  options: { useRegex: true, maxResults: 100 },
  maxChars: 12000,
});
console.log(matches.ndjson);
