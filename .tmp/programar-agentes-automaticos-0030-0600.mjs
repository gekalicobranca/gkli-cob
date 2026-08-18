import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoDir = "C:/Users/Gekali/gkli-cob";
const outputDir = path.join(repoDir, "outputs", "agenda-agentes-automaticos");
const defaultDiaMes = 13;
const inicioMinutos = 30;
const fimMinutos = 6 * 60;

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
    // Optional env file.
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function minutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function timeToShort(time) {
  return String(time ?? "").slice(0, 5);
}

function labelCondominio(condominio) {
  return condominio.nome_operacional || condominio.nome || "Sem nome";
}

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function roundRobinByScript(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.receita.script_key || "sem_script";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => labelCondominio(a.condominio).localeCompare(labelCondominio(b.condominio), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }));
  }

  const orderedGroups = Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
  const result = [];
  let added = true;

  while (added) {
    added = false;
    for (const [, group] of orderedGroups) {
      const next = group.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }

  return result;
}

function plannedTimes(count) {
  if (count <= 0) return [];
  if (count === 1) return [minutesToTime(inicioMinutos)];
  const range = fimMinutos - inicioMinutos;
  return Array.from({ length: count }, (_, index) => {
    const minutes = Math.round(inicioMinutos + (range * index) / (count - 1));
    return minutesToTime(minutes);
  });
}

async function main() {
  await loadEnvFile(path.join(repoDir, ".env.local"));
  await loadEnvFile(path.join(repoDir, ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variáveis do Supabase ausentes.");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: receitas, error: receitasError } = await supabase
    .from("agente_receitas")
    .select("id,nome,script_key,ativo,config_json,administradora:agente_administradoras(nome,ativo)")
    .eq("ativo", true)
    .order("nome");

  if (receitasError) throw receitasError;

  const condominioIds = Array.from(new Set((receitas ?? [])
    .map((receita) => receita.config_json?.condominio_id)
    .filter(Boolean)));

  const { data: condominios, error: condominiosError } = await supabase
    .from("condominios")
    .select("id,nome,nome_operacional,administradora,status,captacao_automatica_habilitada,captacao_dia_mes,captacao_horario,carteiras(nome)")
    .in("id", condominioIds.length ? condominioIds : ["00000000-0000-0000-0000-000000000000"]);

  if (condominiosError) throw condominiosError;

  const condominiosPorId = new Map((condominios ?? []).map((condominio) => [condominio.id, condominio]));
  const items = (receitas ?? [])
    .map((receita) => ({
      receita,
      condominio: condominiosPorId.get(receita.config_json?.condominio_id),
    }))
    .filter((item) => item.condominio?.status === "ativo");

  const orderedItems = roundRobinByScript(items);
  const times = plannedTimes(orderedItems.length);
  const plano = orderedItems.map((item, index) => ({
    receita_id: item.receita.id,
    receita_nome: item.receita.nome,
    script_key: item.receita.script_key,
    administradora_agente: item.receita.administradora?.nome ?? null,
    condominio_id: item.condominio.id,
    condominio_nome: labelCondominio(item.condominio),
    administradora_condominio: item.condominio.administradora,
    carteira: item.condominio.carteiras?.nome ?? null,
    status: item.condominio.status,
    captacao_automatica_habilitada_anterior: item.condominio.captacao_automatica_habilitada,
    captacao_dia_mes_anterior: item.condominio.captacao_dia_mes,
    captacao_horario_anterior: timeToShort(item.condominio.captacao_horario),
    captacao_automatica_habilitada_novo: true,
    captacao_dia_mes_novo: item.condominio.captacao_dia_mes ?? defaultDiaMes,
    captacao_horario_novo: timeToShort(times[index]),
  }));

  await fs.mkdir(outputDir, { recursive: true });
  const currentStamp = stamp();
  const backupPath = path.join(outputDir, `backup_agenda_agentes_${currentStamp}.json`);
  const csvPath = path.join(outputDir, `plano_agenda_agentes_${currentStamp}.csv`);

  await fs.writeFile(backupPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    janela: "00:30-06:00",
    defaultDiaMes,
    totalReceitasAtivasComCondominioAtivo: plano.length,
    plano,
  }, null, 2), "utf8");

  const columns = Object.keys(plano[0] ?? {});
  await fs.writeFile(csvPath, [
    columns.map(toCsvValue).join(","),
    ...plano.map((row) => columns.map((column) => toCsvValue(row[column])).join(",")),
  ].join("\n"), "utf8");

  for (const row of plano) {
    const { error } = await supabase
      .from("condominios")
      .update({
        captacao_automatica_habilitada: true,
        captacao_dia_mes: row.captacao_dia_mes_novo,
        captacao_horario: `${row.captacao_horario_novo}:00`,
      })
      .eq("id", row.condominio_id);

    if (error) throw error;
  }

  const { data: verificados, error: verificarError } = await supabase
    .from("condominios")
    .select("id,nome,nome_operacional,captacao_automatica_habilitada,captacao_dia_mes,captacao_horario")
    .in("id", plano.map((row) => row.condominio_id));

  if (verificarError) throw verificarError;

  const verificadosPorId = new Map((verificados ?? []).map((row) => [row.id, row]));
  const divergencias = plano.filter((row) => {
    const atual = verificadosPorId.get(row.condominio_id);
    return !atual
      || atual.captacao_automatica_habilitada !== true
      || Number(atual.captacao_dia_mes) !== Number(row.captacao_dia_mes_novo)
      || timeToShort(atual.captacao_horario) !== row.captacao_horario_novo;
  });

  const horarios = new Map();
  for (const row of plano) {
    horarios.set(row.captacao_horario_novo, (horarios.get(row.captacao_horario_novo) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    atualizados: plano.length,
    janela: "00:30-06:00",
    primeiroHorario: plano[0]?.captacao_horario_novo ?? null,
    ultimoHorario: plano.at(-1)?.captacao_horario_novo ?? null,
    diaMes: defaultDiaMes,
    backupPath,
    csvPath,
    divergencias: divergencias.length,
    horariosComMaisDeUmaExecucao: Array.from(horarios.entries()).filter(([, count]) => count > 1),
    amostra: plano.slice(0, 8).map((row) => ({
      horario: row.captacao_horario_novo,
      script_key: row.script_key,
      condominio: row.condominio_nome,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
