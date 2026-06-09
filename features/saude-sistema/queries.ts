import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";

type Severity = "ok" | "atencao" | "critico";

export type HealthSignal = {
  id: string;
  area: string;
  title: string;
  detail: string;
  severity: Severity;
  href?: string;
  when?: string | null;
};

export type HealthMetric = {
  id: string;
  label: string;
  value: number;
  detail: string;
  severity: Severity;
  href?: string;
};

export type SystemHealthSnapshot = {
  generatedAt: string;
  score: number;
  severity: Severity;
  metrics: HealthMetric[];
  signals: HealthSignal[];
};

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function dateOnlyDaysAgo(days: number) {
  return daysAgo(days).slice(0, 10);
}

function asText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function severityByCount(value: number, warningAt = 1, criticalAt = 5): Severity {
  if (value >= criticalAt) return "critico";
  if (value >= warningAt) return "atencao";
  return "ok";
}

function maxSeverity(values: Severity[]): Severity {
  if (values.includes("critico")) return "critico";
  if (values.includes("atencao")) return "atencao";
  return "ok";
}

function metricScorePenalty(metric: HealthMetric) {
  if (metric.severity === "critico") return Math.min(28, Math.max(12, metric.value * 4));
  if (metric.severity === "atencao") return Math.min(12, Math.max(5, metric.value * 2));
  return 0;
}

async function resolveQuery<T>(
  query: PromiseLike<{ data: T[] | null; error: any }>,
  label: string,
) {
  const { data, error } = await query;
  if (error) {
    return {
      rows: [] as T[],
      errorSignal: {
        id: `consulta-${label}`,
        area: "Consultas",
        title: `Falha ao consultar ${label}`,
        detail: error.message ?? "A consulta não retornou dados.",
        severity: "critico" as Severity,
      },
    };
  }

  return { rows: data ?? [], errorSignal: null };
}

export async function getSystemHealthSnapshot(scope: CarteiraScope): Promise<SystemHealthSnapshot> {
  const supabase = await createClient();

  let mensagensQuery = supabase
    .from("mensagens")
    .select("id, carteira_id, contexto, canal, destinatario, status, status_operacional, ultimo_erro, erro, created_at, updated_at")
    .or("status.eq.falha,status_operacional.eq.falha")
    .gte("created_at", daysAgo(14))
    .order("created_at", { ascending: false })
    .limit(50);
  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds);

  let lotesQuery = supabase
    .from("lotes")
    .select("id, carteira_id, tipo, status, total_erros, total_pendentes, created_at, finalizado_em, resumo")
    .in("status", ["erro", "processando", "gerado", "pendente_aprovacao"])
    .order("created_at", { ascending: false })
    .limit(50);
  lotesQuery = applyCarteiraScope(lotesQuery, scope.carteiraIds);

  let pendenciasQuery = supabase
    .from("central_pendencias")
    .select("id, carteira_id, titulo, descricao, status, prioridade, origem, tipo, prazo_limite, created_at")
    .not("status", "in", "(resolvida,cancelada)")
    .order("prazo_limite", { ascending: true, nullsFirst: false })
    .limit(80);
  pendenciasQuery = applyCarteiraScope(pendenciasQuery, scope.carteiraIds);

  let acordosQuery = supabase
    .from("acordos")
    .select("id, carteira_id, status, fluxo_status, status_financeiro, valor_acordado, devedor_aceito_em, boletos_solicitados_em, boletos_emitidos_em, created_at, updated_at, condominios:condominio_id(nome), unidades:unidade_id(identificacao, bloco, responsavel_nome)")
    .in("status", ["ativo", "em_dia", "em_atraso", "vencido"])
    .order("updated_at", { ascending: true })
    .limit(100);
  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds);

  let parcelasQuery = supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, numero, valor, vencimento, status, acordos:acordo_id(id, carteira_id, condominios:condominio_id(nome), unidades:unidade_id(identificacao, bloco, responsavel_nome))")
    .in("status", ["pendente", "vencida"])
    .lt("vencimento", dateOnlyDaysAgo(0))
    .order("vencimento", { ascending: true })
    .limit(80);

  if (scope.carteiraIds && scope.carteiraIds.length > 0) {
    parcelasQuery = parcelasQuery.in("acordos.carteira_id", scope.carteiraIds);
  }

  const jobsQuery = supabase
    .from("jobs_operacionais")
    .select("id, tipo, status, tentativas, erro, processar_apos, created_at, processado_em")
    .in("status", ["erro", "pendente", "processando"])
    .order("created_at", { ascending: false })
    .limit(40);

  let eventosQuery = supabase
    .from("timeline_operacional")
    .select("id, carteira_id, entidade_tipo, evento_tipo, titulo, descricao, severidade, ocorreu_em, created_at")
    .in("severidade", ["alerta", "erro", "critico"])
    .gte("created_at", daysAgo(7))
    .order("created_at", { ascending: false })
    .limit(40);
  eventosQuery = applyCarteiraScope(eventosQuery, scope.carteiraIds);

  const [
    mensagensResult,
    lotesResult,
    pendenciasResult,
    acordosResult,
    parcelasResult,
    jobsResult,
    eventosResult,
  ] = await Promise.all([
    resolveQuery<any>(mensagensQuery as any, "mensagens com falha"),
    resolveQuery<any>(lotesQuery as any, "lotes em atenção"),
    resolveQuery<any>(pendenciasQuery as any, "pendências"),
    resolveQuery<any>(acordosQuery as any, "acordos"),
    resolveQuery<any>(parcelasQuery as any, "parcelas vencidas"),
    resolveQuery<any>(jobsQuery as any, "jobs operacionais"),
    resolveQuery<any>(eventosQuery as any, "timeline operacional"),
  ]);

  const now = Date.now();
  const staleAgreementLimit = now - 48 * 60 * 60 * 1000;
  const staleLotLimit = now - 24 * 60 * 60 * 1000;
  const staleJobLimit = now - 2 * 60 * 60 * 1000;

  const mensagensFalha = mensagensResult.rows;
  const lotesAtencao = lotesResult.rows.filter((row: any) => {
    const createdAt = new Date(row.created_at ?? 0).getTime();
    return row.status === "erro" || Number(row.total_erros ?? 0) > 0 || createdAt < staleLotLimit;
  });
  const pendenciasAbertas = pendenciasResult.rows;
  const pendenciasCriticas = pendenciasAbertas.filter((row: any) => row.prioridade === "critica");
  const pendenciasAtrasadas = pendenciasAbertas.filter((row: any) => {
    if (!row.prazo_limite) return false;
    return new Date(row.prazo_limite).getTime() < now;
  });
  const acordosParados = acordosResult.rows.filter((row: any) => {
    const updatedAt = new Date(row.updated_at ?? row.created_at ?? 0).getTime();
    const fluxo = asText(row.fluxo_status, "").toLowerCase();
    const aguardandoAceite = fluxo.includes("aceite") && !row.devedor_aceito_em;
    const aguardandoBoleto = row.boletos_solicitados_em && !row.boletos_emitidos_em;
    return updatedAt < staleAgreementLimit && (aguardandoAceite || aguardandoBoleto);
  });
  const parcelasVencidas = parcelasResult.rows;
  const jobsComFalha = jobsResult.rows.filter((row: any) => {
    const createdAt = new Date(row.created_at ?? 0).getTime();
    return row.status === "erro" || createdAt < staleJobLimit;
  });
  const eventosAtencao = eventosResult.rows;

  const querySignals = [
    mensagensResult.errorSignal,
    lotesResult.errorSignal,
    pendenciasResult.errorSignal,
    acordosResult.errorSignal,
    parcelasResult.errorSignal,
    jobsResult.errorSignal,
    eventosResult.errorSignal,
  ].filter(Boolean) as HealthSignal[];

  const metrics: HealthMetric[] = [
    {
      id: "mensagens-falha",
      label: "Mensagens com falha",
      value: mensagensFalha.length,
      detail: "Últimos 14 dias",
      severity: severityByCount(mensagensFalha.length, 1, 5),
      href: "/app/mensageria/log",
    },
    {
      id: "lotes-atencao",
      label: "Lotes em atenção",
      value: lotesAtencao.length,
      detail: "Erro ou sem conclusão",
      severity: severityByCount(lotesAtencao.length, 1, 4),
      href: "/app/lotes",
    },
    {
      id: "pendencias-criticas",
      label: "Pendências críticas",
      value: pendenciasCriticas.length + pendenciasAtrasadas.length,
      detail: "Críticas ou atrasadas",
      severity: severityByCount(pendenciasCriticas.length + pendenciasAtrasadas.length, 1, 6),
      href: "/app/pendencias",
    },
    {
      id: "acordos-parados",
      label: "Acordos parados",
      value: acordosParados.length,
      detail: "Aceite ou boleto há mais de 48h",
      severity: severityByCount(acordosParados.length, 1, 4),
      href: "/app/gestao/acionamentos-acordos",
    },
    {
      id: "parcelas-vencidas",
      label: "Parcelas vencidas",
      value: parcelasVencidas.length,
      detail: "Pendentes de confirmação",
      severity: severityByCount(parcelasVencidas.length, 1, 8),
      href: "/app/acordos/fila",
    },
    {
      id: "jobs-falha",
      label: "Jobs travados",
      value: jobsComFalha.length,
      detail: "Erro ou processamento antigo",
      severity: severityByCount(jobsComFalha.length, 1, 3),
      href: "/app/configuracoes",
    },
  ];

  const signals: HealthSignal[] = [
    ...querySignals,
    ...mensagensFalha.slice(0, 5).map((row: any) => ({
      id: `mensagem-${row.id}`,
      area: "Mensageria",
      title: `${asText(row.canal, "Canal")} com falha`,
      detail: asText(row.ultimo_erro ?? row.erro ?? row.destinatario ?? row.contexto, "Mensagem sem detalhe de erro."),
      severity: "critico" as Severity,
      href: "/app/mensageria/log",
      when: row.created_at,
    })),
    ...lotesAtencao.slice(0, 5).map((row: any) => ({
      id: `lote-${row.id}`,
      area: "Lotes",
      title: `Lote ${asText(row.tipo)} em ${asText(row.status)}`,
      detail: `${Number(row.total_erros ?? 0)} erro(s), ${Number(row.total_pendentes ?? 0)} pendente(s).`,
      severity: row.status === "erro" ? "critico" as Severity : "atencao" as Severity,
      href: "/app/lotes",
      when: row.created_at,
    })),
    ...pendenciasAtrasadas.slice(0, 5).map((row: any) => ({
      id: `pendencia-${row.id}`,
      area: "Pendências",
      title: asText(row.titulo, "Pendência atrasada"),
      detail: `${asText(row.origem)} · ${asText(row.tipo)} · prazo vencido.`,
      severity: row.prioridade === "critica" ? "critico" as Severity : "atencao" as Severity,
      href: "/app/pendencias",
      when: row.prazo_limite ?? row.created_at,
    })),
    ...acordosParados.slice(0, 5).map((row: any) => ({
      id: `acordo-${row.id}`,
      area: "Acordos",
      title: `Acordo aguardando ${row.devedor_aceito_em ? "boleto" : "aceite"}`,
      detail: `${asText(row.condominios?.nome, "Condomínio não informado")} · ${asText(row.unidades?.responsavel_nome, "Responsável não informado")}`,
      severity: "atencao" as Severity,
      href: `/app/acordos/${row.id}`,
      when: row.updated_at ?? row.created_at,
    })),
    ...parcelasVencidas.slice(0, 5).map((row: any) => ({
      id: `parcela-${row.id}`,
      area: "Parcelas",
      title: `Parcela ${row.numero ?? "-"} vencida`,
      detail: `${asText(row.acordos?.condominios?.nome, "Condomínio não informado")} · vencimento ${asText(row.vencimento)}`,
      severity: "critico" as Severity,
      href: "/app/acordos/fila",
      when: row.vencimento,
    })),
    ...jobsComFalha.slice(0, 5).map((row: any) => ({
      id: `job-${row.id}`,
      area: "Jobs",
      title: `Job ${asText(row.tipo)} em ${asText(row.status)}`,
      detail: asText(row.erro, `${Number(row.tentativas ?? 0)} tentativa(s).`),
      severity: row.status === "erro" ? "critico" as Severity : "atencao" as Severity,
      href: "/app/configuracoes",
      when: row.created_at,
    })),
    ...eventosAtencao.slice(0, 5).map((row: any) => ({
      id: `evento-${row.id}`,
      area: "Timeline",
      title: asText(row.titulo ?? row.evento_tipo, "Evento operacional"),
      detail: asText(row.descricao ?? row.entidade_tipo, "Evento sem descrição."),
      severity: row.severidade === "critico" || row.severidade === "erro" ? "critico" as Severity : "atencao" as Severity,
      href: "/app/timeline",
      when: row.ocorreu_em ?? row.created_at,
    })),
  ];

  const score = Math.max(0, Math.min(100, 100 - metrics.reduce((sum, metric) => sum + metricScorePenalty(metric), 0) - querySignals.length * 18));
  const severity = maxSeverity(metrics.map((metric) => metric.severity).concat(querySignals.map((signal) => signal.severity)));

  return {
    generatedAt: new Date().toISOString(),
    score,
    severity,
    metrics,
    signals: signals.slice(0, 24),
  };
}
