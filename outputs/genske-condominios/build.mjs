import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "C:/Users/Gekali/gkli-cob";
const outputDir = `${root}/outputs/genske-condominios`;

const envText = await fs.readFile(`${root}/.env.local`, "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^['\"]|['\"]$/g, "")] : null;
}).filter(Boolean));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: carteira, error: carteiraError } = await supabase
  .from("carteiras").select("id,nome").eq("nome", "Genske Advogados").single();
if (carteiraError) throw carteiraError;

const { data: condominios, error } = await supabase
  .from("condominios")
  .select("nome,nome_operacional,cnpj,administradora,status,classificacao_operacional,operacao_virtual_habilitada,vencimento_cota_dia,valor_cota_condominial,inicio_cobranca_dias,dias_expiracao_regua_pre_juridico,parcelas_acordo_sem_aprovacao_sindico,dias_reemissao_parcela_acordo_atrasada,regua_cobranca_id,regua_acordo_id,observacoes")
  .eq("carteira_id", carteira.id).order("nome");
if (error) throw error;

const reguaIds = [...new Set(condominios.flatMap((item) => [item.regua_cobranca_id, item.regua_acordo_id]).filter(Boolean))];
const { data: reguas, error: reguasError } = reguaIds.length
  ? await supabase.from("reguas").select("id,nome").in("id", reguaIds)
  : { data: [], error: null };
if (reguasError) throw reguasError;
const reguaPorId = new Map((reguas ?? []).map((item) => [item.id, item.nome]));

const formatCnpj = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").padStart(14, "0");
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

const rows = condominios.map((item) => [
  item.nome,
  item.nome_operacional || item.nome,
  formatCnpj(item.cnpj),
  item.administradora || "Não informada",
  item.status === "ativo" ? "Ativo" : item.status === "pausado" ? "Pausado" : "Inativo",
  String(item.classificacao_operacional ?? "Não informada").replace(/^./, (c) => c.toUpperCase()),
  item.operacao_virtual_habilitada ? "Sim" : "Não",
  Number(item.vencimento_cota_dia ?? 0),
  Number(item.valor_cota_condominial ?? 0),
  Number(item.inicio_cobranca_dias ?? 0),
  item.dias_expiracao_regua_pre_juridico == null ? "Não configurado" : Number(item.dias_expiracao_regua_pre_juridico),
  Number(item.parcelas_acordo_sem_aprovacao_sindico ?? 0),
  Number(item.dias_reemissao_parcela_acordo_atrasada ?? 0) > 0 ? "Sim" : "Não",
  Number(item.dias_reemissao_parcela_acordo_atrasada ?? 0),
  item.regua_cobranca_id ? (reguaPorId.get(item.regua_cobranca_id) ?? "Régua não localizada") : "Padrão/fallback",
  item.regua_acordo_id ? (reguaPorId.get(item.regua_acordo_id) ?? "Régua não localizada") : "Padrão/fallback",
  item.observacoes || "",
]);

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Condomínios");
sheet.showGridLines = false;
sheet.getRange("A1:Q1").merge();
sheet.getRange("A1").values = [["Condomínios — Genske Advogados"]];
sheet.getRange("A1:Q1").format = {
  fill: "#075E75",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
sheet.getRange("A1:Q1").format.rowHeight = 30;

sheet.getRange("A2:Q2").merge();
sheet.getRange("A2").values = [["Todos os parâmetros operacionais atualmente cadastrados no sistema"]];
sheet.getRange("A2:Q2").format = { fill: "#EAF6F9", font: { color: "#315B66", italic: true } };

sheet.getRange("A4:G4").values = [["Condomínios", "Com reemissão", "Sem reemissão", "Ativos", "Inativos", "Carteira", "Atualizado em"]];
sheet.getRange("A5:G5").values = [[rows.length, null, null, null, null, carteira.nome, new Date()]];
sheet.getRange("B5").formulas = [[`=COUNTIF(M8:M${rows.length + 7},"Sim")`]];
sheet.getRange("C5").formulas = [[`=COUNTIF(M8:M${rows.length + 7},"Não")`]];
sheet.getRange("D5").formulas = [[`=COUNTIF(E8:E${rows.length + 7},"Ativo")`]];
sheet.getRange("E5").formulas = [[`=COUNTIF(E8:E${rows.length + 7},"Inativo")`]];
sheet.getRange("A4:G4").format = { fill: "#DCEEF3", font: { bold: true, color: "#315B66" } };
sheet.getRange("A5:G5").format = { fill: "#F5FAFB", font: { bold: true, color: "#172B33" } };
sheet.getRange("A5:E5").format.numberFormat = "#,##0";
sheet.getRange("G5").format.numberFormat = "dd/mm/yyyy hh:mm";

const headers = ["Condomínio", "Nome operacional", "CNPJ", "Administradora", "Status", "Classificação operacional", "Operação virtual", "Dia de vencimento", "Valor médio da cota", "Início da cobrança (dias)", "Expiração pós-régua (dias)", "Parcelas sem aprovação do síndico", "Permite reemissão", "Limite para reemissão (dias)", "Régua de cobrança", "Régua de acordos", "Observações internas"];
sheet.getRange("A7:Q7").values = [headers];
sheet.getRange(`A8:Q${rows.length + 7}`).values = rows;
const table = sheet.tables.add(`A7:Q${rows.length + 7}`, true, "CondominiosGenske");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

sheet.getRange("A7:Q7").format = { fill: "#075E75", font: { bold: true, color: "#FFFFFF" }, wrapText: true, verticalAlignment: "center" };
sheet.getRange("A7:Q7").format.rowHeight = 42;
sheet.getRange(`E8:N${rows.length + 7}`).format.horizontalAlignment = "center";
sheet.getRange(`I8:I${rows.length + 7}`).format.numberFormat = 'R$ #,##0.00';
sheet.getRange(`A8:Q${rows.length + 7}`).format.borders = { preset: "insideHorizontal", style: "thin", color: "#DDE7EA" };
sheet.getRange(`M8:M${rows.length + 7}`).conditionalFormats.add("containsText", { text: "Sim", format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } } });
sheet.getRange(`M8:M${rows.length + 7}`).conditionalFormats.add("containsText", { text: "Não", format: { fill: "#FEE2E2", font: { color: "#991B1B" } } });
sheet.getRange(`G8:G${rows.length + 7}`).conditionalFormats.add("containsText", { text: "Sim", format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } } });

const widths = [42, 36, 19, 26, 12, 20, 17, 16, 19, 22, 24, 28, 18, 25, 28, 28, 42];
"ABCDEFGHIJKLMNOPQ".split("").forEach((col, index) => { sheet.getRange(`${col}:${col}`).format.columnWidth = widths[index]; });
sheet.freezePanes.freezeRows(7);

const inspect = await workbook.inspect({ kind: "table", range: `Condomínios!A1:Q12`, include: "values,formulas", tableMaxRows: 12, tableMaxCols: 17 });
console.log(inspect.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula errors" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Condomínios", range: "A1:Q15", scale: 0.8, format: "png" });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Condominios_Genske_Advogados.xlsx`);
console.log(JSON.stringify({ rows: rows.length, output: `${outputDir}/Condominios_Genske_Advogados.xlsx` }));
