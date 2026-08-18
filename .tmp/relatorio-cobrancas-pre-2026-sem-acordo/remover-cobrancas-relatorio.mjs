import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoDir = "C:/Users/Gekali/gkli-cob";
const outputDir = path.join(repoDir, "outputs", "relatorio-cobrancas-pre-2026-sem-acordo");
const cutoff = "2026-01-01";
const pageSize = 1000;
const expectedEligibleCount = 1027;
const executeDelete = process.env.EXECUTAR_REMOCAO === "1";

const negotiationStatuses = new Set([
  "em_negociacao",
  "possivel_acordo",
  "acordo_firmado",
  "acordo_efetivado",
]);
const finalAgreementStatuses = new Set(["quitado", "cancelado", "renegociado"]);
const excludedFinancialStatuses = new Set(["quitado", "renegociado"]);

const dependencyTables = [
  { table: "acordos", columns: "id,cobranca_id,status,status_financeiro", blocker: true },
  { table: "acordo_cobrancas", columns: "acordo_id,cobranca_id", blocker: true },
  { table: "saneamento_cobrancas", columns: "id,cobranca_id,status,tipo", blocker: true },
  { table: "lote_itens", columns: "id,lote_id,cobranca_id,status,retorno_tipo", blocker: false },
  { table: "mensagens", columns: "id,cobranca_id,status,status_operacional,canal", blocker: false },
  { table: "eventos_operacionais", columns: "id,cobranca_id,tipo,created_at", blocker: false },
  { table: "timeline_operacional", columns: "id,cobranca_id,evento_tipo,titulo,created_at", blocker: false },
  { table: "central_pendencias", columns: "id,cobranca_id,status,tipo", blocker: false },
  { table: "regua_pausas", columns: "id,cobranca_id,ativo,pausa_ate", blocker: false },
  { table: "regua_inteligencia_scores", columns: "id,cobranca_id,calculado_em", blocker: false },
  { table: "fechamento_pagamentos", columns: "id,cobranca_id", blocker: false },
  { table: "solicitacoes_administradora", columns: "id,cobranca_id,status", blocker: false },
];

const cleanupTables = [
  { table: "central_pendencias", columns: "*", mode: "cobranca_id" },
  { table: "timeline_operacional", columns: "*", mode: "timeline" },
];

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadEnvFile(filename) {
  try {
    const text = await fs.readFile(filename, "utf8");
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
  } catch {
    // Env file is optional.
  }
}

function normalizeStatus(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

function money(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
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

async function fetchRowsByIds(supabase, table, columns, ids, size = 100) {
  const rows = [];
  for (const idsChunk of chunk(ids, size)) {
    const { data, error } = await supabase.from(table).select(columns).in("id", idsChunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function fetchTargetRows(supabase) {
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

  const targetRows = cobrancasPre2026
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

  return {
    cobrancasPre2026,
    unidadeIds,
    unidadesComNegociacao,
    unidadesComAcordo,
    targetRows,
  };
}

async function checkDependencyTable(supabase, config, ids) {
  let count = 0;
  const samples = [];
  for (const idsChunk of chunk(ids, 100)) {
    const { data, error, count: chunkCount } = await supabase
      .from(config.table)
      .select(config.columns, { count: "exact" })
      .in("cobranca_id", idsChunk)
      .limit(10);

    if (error) {
      if (String(error.code ?? "").startsWith("42") || String(error.message ?? "").includes("does not exist")) {
        return { ...config, count: 0, samples: [], skipped: true, error: error.message };
      }
      throw error;
    }
    count += chunkCount ?? data?.length ?? 0;
    if (samples.length < 10) samples.push(...(data ?? []).slice(0, 10 - samples.length));
  }
  return { ...config, count, samples, skipped: false };
}

async function fetchCleanupRows(supabase, ids) {
  const result = {};
  for (const config of cleanupTables) {
    const rowsById = new Map();
    for (const idsChunk of chunk(ids, 100)) {
      if (config.mode === "timeline") {
        const byCobranca = await supabase
          .from(config.table)
          .select(config.columns)
          .in("cobranca_id", idsChunk);
        if (byCobranca.error) throw byCobranca.error;
        for (const row of byCobranca.data ?? []) rowsById.set(row.id, row);

        const byEntidade = await supabase
          .from(config.table)
          .select(config.columns)
          .eq("entidade_tipo", "cobranca")
          .in("entidade_id", idsChunk);
        if (byEntidade.error) throw byEntidade.error;
        for (const row of byEntidade.data ?? []) rowsById.set(row.id, row);
      } else {
        const byCobranca = await supabase
          .from(config.table)
          .select(config.columns)
          .in("cobranca_id", idsChunk);
        if (byCobranca.error) throw byCobranca.error;
        for (const row of byCobranca.data ?? []) rowsById.set(row.id, row);
      }
    }
    result[config.table] = Array.from(rowsById.values());
  }
  return result;
}

async function deleteCleanupRows(supabase, ids) {
  const result = {};
  for (const config of cleanupTables) {
    const deletedById = new Map();
    for (const idsChunk of chunk(ids, 100)) {
      if (config.mode === "timeline") {
        const byCobranca = await supabase
          .from(config.table)
          .delete()
          .in("cobranca_id", idsChunk)
          .select("id");
        if (byCobranca.error) throw byCobranca.error;
        for (const row of byCobranca.data ?? []) deletedById.set(row.id, row);

        const byEntidade = await supabase
          .from(config.table)
          .delete()
          .eq("entidade_tipo", "cobranca")
          .in("entidade_id", idsChunk)
          .select("id");
        if (byEntidade.error) throw byEntidade.error;
        for (const row of byEntidade.data ?? []) deletedById.set(row.id, row);
      } else {
        const byCobranca = await supabase
          .from(config.table)
          .delete()
          .in("cobranca_id", idsChunk)
          .select("id");
        if (byCobranca.error) throw byCobranca.error;
        for (const row of byCobranca.data ?? []) deletedById.set(row.id, row);
      }
    }
    result[config.table] = deletedById.size;
  }
  return result;
}

async function deleteRowsByIds(supabase, ids) {
  const deleted = [];
  for (const idsChunk of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from("cobrancas")
      .delete()
      .in("id", idsChunk)
      .select("id");
    if (error) throw error;
    deleted.push(...(data ?? []));
  }
  return deleted;
}

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function writeBackup({ targetRows, fullRows, dependencyResults, cleanupRows, summary }) {
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile();
  const jsonPath = path.join(outputDir, `backup_remocao_cobrancas_pre_2026_${stamp}.json`);
  const csvPath = path.join(outputDir, `backup_remocao_cobrancas_pre_2026_${stamp}.csv`);

  const backup = {
    generatedAt: new Date().toISOString(),
    criteria: {
      vencimentoAnteriorA: cutoff,
      excluiUnidadesComAcordoNaoFinalizado: true,
      acordosFinalizados: Array.from(finalAgreementStatuses),
      excluiUnidadesComStatusNegociacao: Array.from(negotiationStatuses),
      excluiCobrancasQuitadasOuRenegociadas: true,
    },
    summary,
    dependencyResults,
    cleanupRows,
    targetRows,
    fullRows,
  };

  await fs.writeFile(jsonPath, JSON.stringify(backup, null, 2), "utf8");

  const columns = Array.from(new Set(fullRows.flatMap((row) => Object.keys(row))));
  const lines = [
    columns.map(toCsvValue).join(","),
    ...fullRows.map((row) => columns.map((column) => toCsvValue(row[column])).join(",")),
  ];
  await fs.writeFile(csvPath, lines.join("\n"), "utf8");

  return { jsonPath, csvPath };
}

async function countRemainingIds(supabase, ids) {
  let count = 0;
  for (const idsChunk of chunk(ids, 100)) {
    const { count: chunkCount, error } = await supabase
      .from("cobrancas")
      .select("id", { count: "exact", head: true })
      .in("id", idsChunk);
    if (error) throw error;
    count += chunkCount ?? 0;
  }
  return count;
}

async function main() {
  await loadEnvFile(path.join(repoDir, ".env.local"));
  await loadEnvFile(path.join(repoDir, ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variaveis do Supabase ausentes.");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const {
    cobrancasPre2026,
    unidadeIds,
    unidadesComNegociacao,
    unidadesComAcordo,
    targetRows,
  } = await fetchTargetRows(supabase);

  const targetIds = Array.from(new Set(targetRows.map((row) => row.id)));
  const totalOriginal = targetRows.reduce((sum, row) => sum + money(row.valor_original), 0);
  const totalAtualizado = targetRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0);

  const summary = {
    modo: executeDelete ? "remocao" : "conferencia",
    cobrancasPre2026: cobrancasPre2026.length,
    unidadesCandidatas: unidadeIds.length,
    unidadesExcluidasAcordo: unidadesComAcordo.size,
    unidadesExcluidasNegociacao: unidadesComNegociacao.size,
    cobrancasElegiveisParaRemover: targetRows.length,
    idsUnicos: targetIds.length,
    totalOriginal,
    totalAtualizado,
  };

  if (targetRows.length !== expectedEligibleCount || targetIds.length !== expectedEligibleCount) {
    throw new Error(`Contagem divergente. Esperado ${expectedEligibleCount}, encontrado ${targetRows.length} (${targetIds.length} IDs únicos). Abortado.`);
  }

  const fullRows = await fetchRowsByIds(supabase, "cobrancas", "*", targetIds);
  if (fullRows.length !== expectedEligibleCount) {
    throw new Error(`Backup incompleto. Esperado ${expectedEligibleCount}, encontrado ${fullRows.length}. Abortado.`);
  }

  const dependencyResults = [];
  for (const config of dependencyTables) {
    dependencyResults.push(await checkDependencyTable(supabase, config, targetIds));
  }
  const cleanupRows = await fetchCleanupRows(supabase, targetIds);

  const backupPaths = await writeBackup({ targetRows, fullRows, dependencyResults, cleanupRows, summary });

  const blockers = dependencyResults.filter((item) => item.blocker && item.count > 0);
  if (blockers.length > 0) {
    console.log(JSON.stringify({ summary, backupPaths, dependencyResults, blockers, deleted: false }, null, 2));
    throw new Error("Existem vínculos bloqueadores; remoção direta abortada.");
  }

  if (!executeDelete) {
    console.log(JSON.stringify({ summary, backupPaths, dependencyResults, cleanupCounts: Object.fromEntries(Object.entries(cleanupRows).map(([table, rows]) => [table, rows.length])), deleted: false }, null, 2));
    return;
  }

  const cleanupDeletedCounts = await deleteCleanupRows(supabase, targetIds);
  const deletedRows = await deleteRowsByIds(supabase, targetIds);
  const remainingTargetIds = await countRemainingIds(supabase, targetIds);
  const after = await fetchTargetRows(supabase);

  console.log(JSON.stringify({
    summary,
    backupPaths,
    dependencyResults,
    cleanupDeletedCounts,
    deleted: true,
    deletedCount: deletedRows.length,
    remainingTargetIds,
    cobrancasElegiveisAposRemocao: after.targetRows.length,
    cobrancasPre2026AposRemocao: after.cobrancasPre2026.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
