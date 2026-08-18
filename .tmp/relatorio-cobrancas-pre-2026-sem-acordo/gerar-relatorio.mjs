import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoDir = "C:/Users/Gekali/gkli-cob";
const outputDir = path.join(repoDir, "outputs", "relatorio-cobrancas-pre-2026-sem-acordo");
const outputPath = path.join(outputDir, "cobrancas_pre_2026_sem_acordo_sem_negociacao.xlsx");
const cutoff = "2026-01-01";
const pageSize = 1000;

const negotiationStatuses = new Set([
  "em_negociacao",
  "possivel_acordo",
  "acordo_firmado",
  "acordo_efetivado",
]);
const finalAgreementStatuses = new Set(["quitado", "cancelado", "renegociado"]);
const excludedFinancialStatuses = new Set(["quitado", "renegociado"]);

function loadEnvFile(filename) {
  return fs.readFile(filename, "utf8").then((text) => {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      value = value.replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  }).catch(() => undefined);
}

function normalizeStatus(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "_");
}

function money(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function dateValue(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) chunks.push(array.slice(index, index + size));
  return chunks;
}

async function fetchAll(queryFactory) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory().range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  await loadEnvFile(path.join(repoDir, ".env.local"));
  await loadEnvFile(path.join(repoDir, ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variaveis do Supabase ausentes.");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const cobrancasPre2026 = await fetchAll(() => supabase
    .from("cobrancas")
    .select(`
      id, carteira_id, condominio_id, unidade_id, competencia, vencimento,
      valor_original, valor_atualizado, juros, multa, correcao, desconto,
      status, status_operacional, status_financeiro, observacoes, origem_importacao,
      carteiras(nome),
      condominios(nome, administradora),
      unidades(identificacao, bloco, responsavel_nome)
    `)
    .lt("vencimento", cutoff)
    .order("vencimento", { ascending: true }));

  const unidadeIds = Array.from(new Set(cobrancasPre2026.map((row) => row.unidade_id).filter(Boolean)));

  const unidadesComNegociacao = new Set();
  const negotiationList = Array.from(negotiationStatuses).join(",");
  for (const ids of chunk(unidadeIds, 200)) {
    const { data, error } = await supabase
      .from("cobrancas")
      .select("unidade_id, status, status_operacional")
      .in("unidade_id", ids)
      .or(`status_operacional.in.(${negotiationList}),status.in.(${negotiationList})`);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.unidade_id) unidadesComNegociacao.add(row.unidade_id);
    }
  }

  const unidadesComAcordo = new Set();
  for (const ids of chunk(unidadeIds, 200)) {
    const { data, error } = await supabase
      .from("acordos")
      .select("id, unidade_id, status, status_financeiro")
      .in("unidade_id", ids);
    if (error) throw error;
    for (const acordo of data ?? []) {
      const status = normalizeStatus(acordo.status);
      const statusFinanceiro = normalizeStatus(acordo.status_financeiro);
      const finalizado = finalAgreementStatuses.has(status) || finalAgreementStatuses.has(statusFinanceiro);
      if (acordo.unidade_id && !finalizado) unidadesComAcordo.add(acordo.unidade_id);
    }
  }

  const cobrancasElegiveis = cobrancasPre2026
    .filter((row) => row.unidade_id)
    .filter((row) => !unidadesComAcordo.has(row.unidade_id))
    .filter((row) => !unidadesComNegociacao.has(row.unidade_id))
    .filter((row) => !excludedFinancialStatuses.has(normalizeStatus(row.status_financeiro)))
    .filter((row) => !excludedFinancialStatuses.has(normalizeStatus(row.status)))
    .sort((a, b) => {
      const keysA = [
        a.carteiras?.nome ?? "",
        a.condominios?.administradora ?? "",
        a.condominios?.nome ?? "",
        a.unidades?.identificacao ?? "",
        a.vencimento ?? "",
      ].join("|");
      const keysB = [
        b.carteiras?.nome ?? "",
        b.condominios?.administradora ?? "",
        b.condominios?.nome ?? "",
        b.unidades?.identificacao ?? "",
        b.vencimento ?? "",
      ].join("|");
      return keysA.localeCompare(keysB, "pt-BR");
    });

  const grouped = new Map();
  for (const row of cobrancasElegiveis) {
    const key = [row.carteira_id, row.condominio_id, row.unidade_id].join("|");
    const current = grouped.get(key) ?? {
      carteira: row.carteiras?.nome ?? "Sem carteira",
      administradora: row.condominios?.administradora ?? "Sem administradora",
      condominio: row.condominios?.nome ?? "Sem condomínio",
      unidade: row.unidades?.identificacao ?? "Sem unidade",
      bloco: row.unidades?.bloco ?? "",
      responsavel: row.unidades?.responsavel_nome ?? "",
      qtd: 0,
      primeiroVencimento: row.vencimento,
      ultimoVencimento: row.vencimento,
      totalOriginal: 0,
      totalAtualizado: 0,
      totalJuros: 0,
      totalMulta: 0,
      totalCorrecao: 0,
    };
    current.qtd += 1;
    current.primeiroVencimento = [current.primeiroVencimento, row.vencimento].filter(Boolean).sort()[0] ?? null;
    current.ultimoVencimento = [current.ultimoVencimento, row.vencimento].filter(Boolean).sort().at(-1) ?? null;
    current.totalOriginal += money(row.valor_original);
    current.totalAtualizado += money(row.valor_atualizado);
    current.totalJuros += money(row.juros);
    current.totalMulta += money(row.multa);
    current.totalCorrecao += money(row.correcao);
    grouped.set(key, current);
  }

  const resumoRows = Array.from(grouped.values()).sort((a, b) => [
    a.carteira, a.administradora, a.condominio, a.unidade,
  ].join("|").localeCompare([
    b.carteira, b.administradora, b.condominio, b.unidade,
  ].join("|"), "pt-BR"));

  await fs.mkdir(outputDir, { recursive: true });

  const workbook = Workbook.create();
  const resumo = workbook.worksheets.add("Agrupado");
  const detalhe = workbook.worksheets.add("Detalhe");
  const criterios = workbook.worksheets.add("Critérios");

  for (const sheet of [resumo, detalhe, criterios]) {
    sheet.showGridLines = false;
  }

  const titleFill = "#0F766E";
  const headerFill = "#E0F2FE";
  const noteFill = "#F8FAFC";
  const borderColor = "#CBD5E1";
  const currencyFormat = '"R$"#,##0.00';
  const dateFormat = "yyyy-mm-dd";

  resumo.getRange("A1:M1").merge();
  resumo.getRange("A1").values = [["Cobranças anteriores a 2026 - unidades sem acordo e sem negociação"]];
  resumo.getRange("A1").format = { fill: titleFill, font: { bold: true, color: "#FFFFFF", size: 14 } };
  resumo.getRange("A2:M2").merge();
  resumo.getRange("A2").values = [[`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Valores em reais.`]];
  resumo.getRange("A2").format = { fill: noteFill, font: { color: "#475569" } };

  const resumoHeaders = [[
    "Carteira", "Administradora", "Condomínio", "Unidade", "Bloco", "Responsável",
    "Qtde cobranças", "Primeiro venc.", "Último venc.", "Total original",
    "Total atualizado", "Juros", "Multa",
  ]];
  const resumoData = resumoRows.map((row) => [
    row.carteira,
    row.administradora,
    row.condominio,
    row.unidade,
    row.bloco,
    row.responsavel,
    row.qtd,
    dateValue(row.primeiroVencimento),
    dateValue(row.ultimoVencimento),
    money(row.totalOriginal),
    money(row.totalAtualizado),
    money(row.totalJuros),
    money(row.totalMulta),
  ]);
  resumo.getRange("A4:M4").values = resumoHeaders;
  if (resumoData.length) resumo.getRangeByIndexes(4, 0, resumoData.length, resumoHeaders[0].length).values = resumoData;
  const resumoLastRow = Math.max(5, resumoData.length + 4);
  resumo.getRange(`A4:M${resumoLastRow}`).format.borders = { preset: "all", style: "thin", color: borderColor };
  resumo.getRange("A4:M4").format = { fill: headerFill, font: { bold: true, color: "#0F172A" } };
  resumo.getRange(`G5:G${resumoLastRow}`).format.numberFormat = "#,##0";
  resumo.getRange(`H5:I${resumoLastRow}`).format.numberFormat = dateFormat;
  resumo.getRange(`J5:M${resumoLastRow}`).format.numberFormat = currencyFormat;
  resumo.freezePanes.freezeRows(4);
  if (resumoData.length) resumo.tables.add(`A4:M${resumoLastRow}`, true, "TabelaAgrupada");
  resumo.getRange("A:M").format.autofitColumns();

  detalhe.getRange("A1:R1").merge();
  detalhe.getRange("A1").values = [["Detalhe das cobranças elegíveis"]];
  detalhe.getRange("A1").format = { fill: titleFill, font: { bold: true, color: "#FFFFFF", size: 14 } };
  const detalheHeaders = [[
    "Carteira", "Administradora", "Condomínio", "Unidade", "Bloco", "Responsável",
    "Competência", "Vencimento", "Valor original", "Valor atualizado", "Juros",
    "Multa", "Correção", "Desconto", "Status", "Status operacional",
    "Status financeiro", "Origem importação",
  ]];
  const detalheData = cobrancasElegiveis.map((row) => [
    row.carteiras?.nome ?? "Sem carteira",
    row.condominios?.administradora ?? "Sem administradora",
    row.condominios?.nome ?? "Sem condomínio",
    row.unidades?.identificacao ?? "Sem unidade",
    row.unidades?.bloco ?? "",
    row.unidades?.responsavel_nome ?? "",
    row.competencia ?? "",
    dateValue(row.vencimento),
    money(row.valor_original),
    money(row.valor_atualizado),
    money(row.juros),
    money(row.multa),
    money(row.correcao),
    money(row.desconto),
    row.status ?? "",
    row.status_operacional ?? "",
    row.status_financeiro ?? "",
    row.origem_importacao ?? "",
  ]);
  detalhe.getRange("A3:R3").values = detalheHeaders;
  if (detalheData.length) detalhe.getRangeByIndexes(3, 0, detalheData.length, detalheHeaders[0].length).values = detalheData;
  const detalheLastRow = Math.max(4, detalheData.length + 3);
  detalhe.getRange(`A3:R${detalheLastRow}`).format.borders = { preset: "all", style: "thin", color: borderColor };
  detalhe.getRange("A3:R3").format = { fill: headerFill, font: { bold: true, color: "#0F172A" } };
  detalhe.getRange(`H4:H${detalheLastRow}`).format.numberFormat = dateFormat;
  detalhe.getRange(`I4:N${detalheLastRow}`).format.numberFormat = currencyFormat;
  detalhe.freezePanes.freezeRows(3);
  if (detalheData.length) detalhe.tables.add(`A3:R${detalheLastRow}`, true, "TabelaDetalhe");
  detalhe.getRange("A:R").format.autofitColumns();

  const totalOriginal = cobrancasElegiveis.reduce((sum, row) => sum + money(row.valor_original), 0);
  const totalAtualizado = cobrancasElegiveis.reduce((sum, row) => sum + money(row.valor_atualizado), 0);
  const criteriosData = [
    ["Critério", "Valor"],
    ["Vencimento", `Anterior a ${cutoff}`],
    ["Acordo", "Exclui unidades com qualquer acordo não finalizado. Finalizados: quitado, cancelado, renegociado."],
    ["Negociação", "Exclui unidades com cobrança em em_negociacao, possivel_acordo, acordo_firmado ou acordo_efetivado."],
    ["Cobranças financeiras", "Exclui cobranças quitadas ou renegociadas."],
    ["Cobranças antes de 2026 na base", cobrancasPre2026.length],
    ["Unidades candidatas antes dos filtros", unidadeIds.length],
    ["Unidades excluídas por acordo", unidadesComAcordo.size],
    ["Unidades excluídas por negociação", unidadesComNegociacao.size],
    ["Unidades no relatório", resumoRows.length],
    ["Cobranças no relatório", cobrancasElegiveis.length],
    ["Total original no relatório", totalOriginal],
    ["Total atualizado no relatório", totalAtualizado],
  ];
  criterios.getRangeByIndexes(0, 0, criteriosData.length, 2).values = criteriosData;
  criterios.getRange(`A1:B${criteriosData.length}`).format.borders = { preset: "all", style: "thin", color: borderColor };
  criterios.getRange("A1:B1").format = { fill: headerFill, font: { bold: true, color: "#0F172A" } };
  criterios.getRange("B12:B13").format.numberFormat = currencyFormat;
  criterios.getRange("A:B").format.autofitColumns();

  const inspectResumo = await workbook.inspect({
    kind: "table",
    sheetId: "Agrupado",
    range: `A1:M${Math.min(resumoLastRow, 20)}`,
    tableMaxRows: 20,
    tableMaxCols: 13,
    maxChars: 6000,
  });
  console.log(inspectResumo.ndjson);

  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
    maxChars: 4000,
  });
  console.log(errors.ndjson);

  const previewResumo = await workbook.render({ sheetName: "Agrupado", range: `A1:M${Math.min(resumoLastRow, 30)}`, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, "preview_agrupado.png"), new Uint8Array(await previewResumo.arrayBuffer()));
  const previewDetalhe = await workbook.render({ sheetName: "Detalhe", range: `A1:R${Math.min(detalheLastRow, 30)}`, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, "preview_detalhe.png"), new Uint8Array(await previewDetalhe.arrayBuffer()));
  const previewCriterios = await workbook.render({ sheetName: "Critérios", range: `A1:B${criteriosData.length}`, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, "preview_criterios.png"), new Uint8Array(await previewCriterios.arrayBuffer()));

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  console.log(JSON.stringify({
    outputPath,
    cobrancasPre2026: cobrancasPre2026.length,
    unidadesCandidatas: unidadeIds.length,
    unidadesExcluidasAcordo: unidadesComAcordo.size,
    unidadesExcluidasNegociacao: unidadesComNegociacao.size,
    unidadesRelatorio: resumoRows.length,
    cobrancasRelatorio: cobrancasElegiveis.length,
    totalOriginal,
    totalAtualizado,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
