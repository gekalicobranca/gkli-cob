import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { createClient } from "@supabase/supabase-js";

const inputPath = "C:/Users/Gekali/Downloads/financas_566011197239481.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
console.log((await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 })).ndjson);
console.log((await workbook.inspect({ kind: "table", maxChars: 8000, tableMaxRows: 12, tableMaxCols: 15, tableMaxCellChars: 120 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "financas!U3:AE6", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 12 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "financas!U39:AE39", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 12 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "financas!U48:AE48", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 12 })).ndjson);
console.log((await workbook.inspect({ kind: "table", range: "financas!U54:AE54", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 12 })).ndjson);

const sheet = workbook.worksheets.getItemAt(0);
const used = sheet.getUsedRange(true);
const values = used.values;

const envText = await fs.readFile("C:/Users/Gekali/gkli-cob/.env.local", "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^['\"]|['\"]$/g, "")] : null;
}).filter(Boolean));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: carteira, error: carteiraError } = await supabase.from("carteiras").select("id,nome").eq("nome", "Genske Advogados").single();
if (carteiraError) throw carteiraError;
const { data: cadastrados, error } = await supabase.from("condominios").select("nome,nome_operacional,cnpj").eq("carteira_id", carteira.id);
if (error) throw error;

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\b(CONDOMINIO|COND|EDIFICIO|RESIDENCIAL|ASSOCIACAO)\b/g, " ").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const dbByCnpj = new Map(cadastrados.filter(x => digits(x.cnpj).length === 14).map(x => [digits(x.cnpj), x]));
const dbNames = cadastrados.flatMap(x => [x.nome, x.nome_operacional].filter(Boolean).map(n => ({ key: normalize(n), item: x })));

let headerRow = -1, nameCol = -1, cnpjCol = -1;
for (let r = 0; r < Math.min(values.length, 30); r++) {
  for (let c = 0; c < (values[r] ?? []).length; c++) {
    const h = normalize(values[r][c]);
    if (h.includes("CONDOMINIO") || h === "CLIENTE" || h === "NOME") { headerRow = r; nameCol = c; }
    if (h === "CNPJ" || h.includes("CNPJ CPF")) cnpjCol = c;
  }
  if (headerRow === r && nameCol >= 0) break;
}
if (headerRow < 0) throw new Error("Cabeçalho de condomínio não localizado.");

const sourceRows = [];
for (let r = headerRow + 1; r < values.length; r++) {
  const name = String(values[r]?.[nameCol] ?? "").trim();
  const cnpj = cnpjCol >= 0 ? digits(values[r]?.[cnpjCol]) : "";
  if (!name || normalize(name).length < 3) continue;
  sourceRows.push({ row: r + 1, name, cnpj });
}

const similarity = (a, b) => {
  const aa = new Set(a.split(" ").filter(x => x.length > 2));
  const bb = new Set(b.split(" ").filter(x => x.length > 2));
  if (!aa.size || !bb.size) return 0;
  const common = [...aa].filter(x => bb.has(x)).length;
  return common / Math.max(aa.size, bb.size);
};

const missing = [];
const matched = [];
for (const row of sourceRows) {
  let match = row.cnpj.length === 14 ? dbByCnpj.get(row.cnpj) : null;
  let method = match ? "CNPJ" : "";
  if (!match) {
    const key = normalize(row.name);
    const exact = dbNames.find(x => x.key === key);
    if (exact) { match = exact.item; method = "Nome exato"; }
    else {
      const candidates = dbNames.map(x => ({...x, score: similarity(key, x.key)})).sort((a,b) => b.score-a.score);
      if (candidates[0]?.score >= 0.72) { match = candidates[0].item; method = `Nome semelhante (${candidates[0].score.toFixed(2)})`; }
    }
  }
  (match ? matched : missing).push(match ? {...row, match: match.nome, method} : row);
}

console.log(JSON.stringify({ sheet: sheet.name, usedRows: values.length, headerRow: headerRow + 1, nameCol: nameCol + 1, cnpjCol: cnpjCol + 1, sourceCount: sourceRows.length, matchedCount: matched.length, missingCount: missing.length, missing }, null, 2));
