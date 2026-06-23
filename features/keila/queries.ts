import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { COBRANCA_STATUS } from "@/lib/core/status";
import {
  getCobrancaStatusFinanceiro,
  getCobrancaStatusOperacional,
} from "@/lib/core/cobranca-status";

type KeilaCobranca = {
  id: string;
  carteira_id: string | null;
  condominio_id: string | null;
  valor_atualizado: number | string | null;
  status: string | null;
  status_operacional?: string | null;
  status_financeiro?: string | null;
  condominios?:
    | { nome?: string | null; operacao_virtual_habilitada?: boolean | null }
    | Array<{ nome?: string | null; operacao_virtual_habilitada?: boolean | null }>
    | null;
};

export type KeilaOperationalItem = {
  id: string;
  title: string;
  description: string;
  meta: string;
  href?: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
  state: "pendente" | "supervisao" | "bloqueado" | "processado" | "erro";
  createdAt?: string | null;
};

const CLOSED_COBRANCA_STATUSES = [
  COBRANCA_STATUS.ACORDO_EFETIVADO,
  COBRANCA_STATUS.PRE_JURIDICO,
  COBRANCA_STATUS.JUDICIALIZADO,
  COBRANCA_STATUS.SUSPENSO,
  "quitado",
  "pago",
];

const KEILA_LOTE_ORIGINS = ["keila_teste", "keila_auto"];
const OPEN_PENDENCIA_STATUSES = ["aberta", "em_tratamento", "pendente"];
const PENDING_LOTE_STATUSES = ["pendente", "pendente_aprovacao", "rascunho"];
const DRAFT_MESSAGE_STATUSES = ["rascunho", "pendente", "pendente_aprovacao"];

function money(value: unknown) {
  return Number(value ?? 0) || 0;
}

function relationOne<T>(relation?: T | T[] | null) {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function condominioName(row: KeilaCobranca) {
  return relationOne(row.condominios)?.nome ?? "Sem condomínio";
}

function virtualEnabled(row: KeilaCobranca) {
  return relationOne(row.condominios)?.operacao_virtual_habilitada === true;
}

function isActiveCobranca(row: KeilaCobranca) {
  const operationalStatus = getCobrancaStatusOperacional(row);
  const financialStatus = getCobrancaStatusFinanceiro(row);
  return !CLOSED_COBRANCA_STATUSES.includes(operationalStatus) && financialStatus !== "quitado";
}

function isKeilaLote(row: { resumo?: any; observacoes?: string | null }) {
  const origem = row.resumo?.origem ?? row.resumo?.source ?? row.resumo?.keila_origem;
  if (typeof origem === "string" && KEILA_LOTE_ORIGINS.includes(origem)) return true;
  const observacoes = String(row.observacoes ?? "").toLowerCase();
  return KEILA_LOTE_ORIGINS.some((item) => observacoes.includes(item));
}

function shortDate(value?: string | null) {
  if (!value) return "sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(value?: string | null) {
  return String(value ?? "sem_status").replaceAll("_", " ");
}

export async function getKeilaEligibilitySummary(scope: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      condominios(nome, operacao_virtual_habilitada)
    `,
    );

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar elegibilidade da Keila: ${error.message}`);
  }

  const activeRows = ((data ?? []) as KeilaCobranca[]).filter(isActiveCobranca);
  const enabledRows = activeRows.filter(virtualEnabled);
  const blockedRows = activeRows.filter((row) => !virtualEnabled(row));
  const enabledCondominios = new Set(enabledRows.map((row) => row.condominio_id).filter(Boolean));
  const blockedCondominiosMap = new Map<string, { nome: string; count: number; value: number }>();

  for (const row of blockedRows) {
    const key = row.condominio_id ?? condominioName(row);
    const current = blockedCondominiosMap.get(key) ?? {
      nome: condominioName(row),
      count: 0,
      value: 0,
    };
    current.count += 1;
    current.value += money(row.valor_atualizado);
    blockedCondominiosMap.set(key, current);
  }

  return {
    activeTotal: activeRows.length,
    activeValue: activeRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    enabledTotal: enabledRows.length,
    enabledValue: enabledRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    blockedByCondominioFlag: blockedRows.length,
    blockedValue: blockedRows.reduce((sum, row) => sum + money(row.valor_atualizado), 0),
    enabledCondominios: enabledCondominios.size,
    blockedCondominios: Array.from(blockedCondominiosMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  };
}

export async function listCondominiosKeilaTeste(scope: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("condominios")
    .select("id, nome, carteira_id, regua_cobranca_id")
    .eq("operacao_virtual_habilitada", true)
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar condominios habilitados para Keila: ${error.message}`);
  }

  return (data ?? []) as Array<{
    id: string;
    nome: string | null;
    carteira_id: string | null;
    regua_cobranca_id: string | null;
  }>;
}

export async function getKeilaOperationalQueue(scope: CarteiraScope) {
  const supabase = await createClient();

  let lotesQuery: any = supabase
    .from("lotes")
    .select("id, carteira_id, tipo, status, observacoes, resumo, created_at")
    .eq("tipo", "regua_cobranca")
    .order("created_at", { ascending: false })
    .limit(30);

  lotesQuery = applyCarteiraScope(lotesQuery, scope.carteiraIds);

  let pendenciasQuery: any = supabase
    .from("central_pendencias")
    .select("id, carteira_id, tipo, titulo, descricao, status, prioridade, created_at, cobranca_id, condominio_id, unidade_id")
    .in("tipo", ["planilha_debitos_administradora", "proposta_acordo_keila"])
    .in("status", OPEN_PENDENCIA_STATUSES)
    .order("created_at", { ascending: false })
    .limit(20);

  pendenciasQuery = applyCarteiraScope(pendenciasQuery, scope.carteiraIds);

  let mensagensQuery: any = supabase
    .from("mensagens")
    .select("id, carteira_id, acordo_id, cobranca_id, canal, status, status_operacional, origem_evento, created_at")
    .eq("origem_evento", "keila_acordo_supervisionado")
    .order("created_at", { ascending: false })
    .limit(20);

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds);

  let eventosQuery: any = supabase
    .from("timeline_operacional")
    .select("id, carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao, severidade, created_at, lote_id, mensagem_id, cobranca_id, acordo_id")
    .ilike("evento_tipo", "keila.%")
    .order("created_at", { ascending: false })
    .limit(20);

  eventosQuery = applyCarteiraScope(eventosQuery, scope.carteiraIds);

  const [lotesResult, pendenciasResult, mensagensResult, eventosResult] = await Promise.all([
    lotesQuery,
    pendenciasQuery,
    mensagensQuery,
    eventosQuery,
  ]);

  if (lotesResult.error) {
    throw new Error(`Erro ao carregar lotes da Keila: ${lotesResult.error.message}`);
  }
  if (pendenciasResult.error) {
    throw new Error(`Erro ao carregar pendencias da Keila: ${pendenciasResult.error.message}`);
  }
  if (mensagensResult.error) {
    throw new Error(`Erro ao carregar mensagens da Keila: ${mensagensResult.error.message}`);
  }
  if (eventosResult.error && eventosResult.error.code !== "42P01") {
    throw new Error(`Erro ao carregar auditoria da Keila: ${eventosResult.error.message}`);
  }

  const lotesKeila = ((lotesResult.data ?? []) as any[]).filter(isKeilaLote);
  const loteIds = lotesKeila.map((lote) => lote.id).filter(Boolean);
  let loteItens: any[] = [];

  if (loteIds.length > 0) {
    const { data, error } = await supabase
      .from("lote_itens")
      .select("id, lote_id, cobranca_id, status, retorno_tipo, retorno_registrado_em, payload")
      .in("lote_id", loteIds)
      .limit(150);

    if (error) {
      throw new Error(`Erro ao carregar itens dos lotes da Keila: ${error.message}`);
    }

    loteItens = (data ?? []) as any[];
  }

  const pendencias = (pendenciasResult.data ?? []) as any[];
  const mensagens = (mensagensResult.data ?? []) as any[];
  const eventos = eventosResult.error ? [] : ((eventosResult.data ?? []) as any[]);
  const lotesPendentes = lotesKeila.filter((lote) => PENDING_LOTE_STATUSES.includes(String(lote.status ?? "")));
  const retornosNegociacao = loteItens.filter((item) => item.retorno_tipo === "quer_negociar");
  const mensagensRascunho = mensagens.filter((mensagem) =>
    DRAFT_MESSAGE_STATUSES.includes(String(mensagem.status_operacional ?? mensagem.status ?? "")),
  );
  const pendenciasPlanilha = pendencias.filter((pendencia) => pendencia.tipo === "planilha_debitos_administradora");
  const pendenciasProposta = pendencias.filter((pendencia) => pendencia.tipo === "proposta_acordo_keila");

  const pending: KeilaOperationalItem[] = [];
  if (lotesPendentes.length > 0) {
    pending.push({
      id: "lotes-pendentes",
      title: "Revisar lotes preparados",
      description: "A Keila encontrou lotes aguardando aprovacao antes de qualquer envio.",
      meta: `${lotesPendentes.length} lote(s)`,
      href: "/app/lotes",
      tone: "amber",
      state: "supervisao",
      createdAt: lotesPendentes[0]?.created_at ?? null,
    });
  }
  if (retornosNegociacao.length > 0) {
    pending.push({
      id: "retornos-negociacao",
      title: "Preparar acordos de retornos",
      description: "Existem retornos manuais de negociacao para a Keila formatar proposta supervisionada.",
      meta: `${retornosNegociacao.length} retorno(s)`,
      href: "/app/gestao/keila?tab=painel",
      tone: "green",
      state: "pendente",
      createdAt: retornosNegociacao[0]?.retorno_registrado_em ?? null,
    });
  }
  if (pendenciasProposta.length > 0) {
    pending.push({
      id: "propostas-pendentes",
      title: "Concluir propostas de acordo",
      description: "Ha propostas preparadas como pendencia que ainda precisam de decisao operacional.",
      meta: `${pendenciasProposta.length} proposta(s)`,
      href: "/app/pendencias?tipo=proposta_acordo_keila",
      tone: "blue",
      state: "pendente",
      createdAt: pendenciasProposta[0]?.created_at ?? null,
    });
  }

  const supervision: KeilaOperationalItem[] = mensagensRascunho.slice(0, 8).map((mensagem) => ({
    id: `mensagem-${mensagem.id}`,
    title: "Mensagem de acordo em rascunho",
    description: `${mensagem.canal ?? "Canal nao definido"} aguardando revisao humana antes do envio.`,
    meta: statusLabel(mensagem.status_operacional ?? mensagem.status),
    href: mensagem.acordo_id ? `/app/acordos/${mensagem.acordo_id}` : "/app/acordos",
    tone: "amber",
    state: "supervisao",
    createdAt: mensagem.created_at ?? null,
  }));

  const blocked: KeilaOperationalItem[] = pendenciasPlanilha.slice(0, 8).map((pendencia) => ({
    id: `pendencia-${pendencia.id}`,
    title: pendencia.titulo ?? "Solicitar planilha de debitos",
    description: pendencia.descricao ?? "Negociacao virou o mes e exige debitos atualizados antes da proposta.",
    meta: pendencia.prioridade ?? "pendencia",
    href: "/app/pendencias",
    tone: "red",
    state: "bloqueado",
    createdAt: pendencia.created_at ?? null,
  }));

  const lotes: KeilaOperationalItem[] = lotesKeila.slice(0, 10).map((lote) => ({
    id: `lote-${lote.id}`,
    title: "Lote preparado pela Keila",
    description: lote.observacoes ?? "Lote de regua criado pela operacao virtual.",
    meta: statusLabel(lote.status),
    href: `/app/lotes/${lote.id}`,
    tone: PENDING_LOTE_STATUSES.includes(String(lote.status ?? "")) ? "amber" : "green",
    state: PENDING_LOTE_STATUSES.includes(String(lote.status ?? "")) ? "supervisao" : "processado",
    createdAt: lote.created_at ?? null,
  }));

  const executed: KeilaOperationalItem[] = [
    ...lotes.slice(0, 5),
    ...mensagens.slice(0, 5).map((mensagem) => ({
      id: `audit-mensagem-${mensagem.id}`,
      title: "Mensagem supervisionada registrada",
      description: `${mensagem.canal ?? "Canal"} com origem da Keila.`,
      meta: shortDate(mensagem.created_at),
      href: mensagem.acordo_id ? `/app/acordos/${mensagem.acordo_id}` : "/app/acordos",
      tone: "slate" as const,
      state: "processado" as const,
      createdAt: mensagem.created_at ?? null,
    })),
    ...eventos.slice(0, 8).map((evento) => ({
      id: `audit-evento-${evento.id}`,
      title: evento.titulo ?? "Evento operacional da Keila",
      description: evento.descricao ?? `Evento ${evento.evento_tipo}`,
      meta: shortDate(evento.created_at),
      href: evento.lote_id
        ? `/app/lotes/${evento.lote_id}`
        : evento.acordo_id
          ? `/app/acordos/${evento.acordo_id}`
          : evento.cobranca_id
            ? `/app/cobrancas/${evento.cobranca_id}`
            : "/app/gestao/keila?tab=auditoria",
      tone: evento.severidade === "critico" ? "red" as const : evento.severidade === "alerta" ? "amber" as const : "slate" as const,
      state: evento.severidade === "critico" ? "erro" as const : "processado" as const,
      createdAt: evento.created_at ?? null,
    })),
  ].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return {
    pending,
    supervision,
    blocked,
    lotes,
    executed: executed.slice(0, 10),
    nextAction: pending[0] ?? supervision[0] ?? blocked[0] ?? null,
  };
}
