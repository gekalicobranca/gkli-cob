import { createAdminClient } from "@/utils/supabase/admin";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import {
  ACORDO_STATUS_VIGENTES,
  COBRANCA_STATUS_FINANCEIRO,
  COBRANCA_STATUS_OPERACIONAIS_ATIVOS,
  LOTE_ITEM_STATUS,
  LOTE_STATUS,
  LOTE_TIPO,
  MENSAGEM_STATUS,
} from "@/lib/core/status";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { normalizeRelationsList } from "@/utils/supabase/normalize-relation";
import { registrarEventoOperacional } from "@/features/operacional/service";
import {
  diasDesdeVencimento,
  formatDateBR,
  formatMoneyBR,
  isCobrancaElegivelParaRegua,
  montarMensagem,
  selecionarEtapa,
} from "../engine";
import { carregarEtapasDeReguaAdmin } from "../queries";
import { avaliarComplianceRegua } from "./compliance";
import { verificarSuspensaoRegua } from "./suspension";
import { salvarScoreRegua } from "./intelligence";
import { resolveTemplateMensagem } from "@/features/mensageria/template-resolver";
import type { ReguaTom } from "../types";
import {
  cicloReferencia,
  criarReguaFingerprint,
  normalizarEtapaId,
  novoContador,
  resumoContadores,
  statusFinalDoLote,
  type ReguaContadores,
} from "./regua-shared";

type LoteItemStatus = (typeof LOTE_ITEM_STATUS)[keyof typeof LOTE_ITEM_STATUS];

const PAGE_SIZE = 1000;

type CobrancaReguaRow = {
  id: string;
  carteira_id: string;
  condominio_id?: string | null;
  competencia?: string | null;
  vencimento?: string | null;
  valor_atualizado?: number | string | null;
  valor_original?: number | string | null;
  status?: string | null;
  status_operacional?: string | null;
  status_financeiro?: string | null;
  automacao_bloqueada?: boolean | null;
  ultima_interacao_at?: string | null;
  ultima_interacao_em?: string | null;
  proxima_acao_em?: string | null;
  condominios?: {
    id?: string | null;
    nome?: string | null;
    inicio_cobranca_dias?: number | null;
    dias_apos_vencimento_regua?: number | null;
    intensidade_regua?: string | null;
    regua_cobranca_id?: string | null;
  } | null;
  unidades?: {
    id?: string | null;
    identificacao?: string | null;
    bloco?: string | null;
    responsavel_nome?: string | null;
    telefone?: string | null;
    email?: string | null;
  } | null;
};

export type ResultadoLoteRegua = {
  loteId: string;
  loteIds: string[];
  totalAvaliadas: number;
  totalCriadas: number;
  totalPuladas: number;
  totalDuplicadas: number;
  totalErros: number;
  itens: Array<{
    cobrancaId?: string;
    status: LoteItemStatus;
    motivo?: string;
    mensagemId?: string;
  }>;
};

type ProcessarReguaParams = {
  scope?: CarteiraScope;
  origem?: "manual" | "api" | "cron";
  cooldownDias?: number;
  q?: string;
  carteiraId?: string;
  condominioId?: string;
  contato?: string;
  cobrancaIds?: string[];
  reguaId?: string;
};

type Contadores = ReguaContadores;

type LoteContext = {
  id: string;
  carteiraId: string;
  reguaId: string | null;
  reguaReferencia: string;
  contadores: Contadores;
};

function getInicioRegua(row: CobrancaReguaRow) {
  const condominio = row.condominios;
  return Number(
    condominio?.dias_apos_vencimento_regua ??
      condominio?.inicio_cobranca_dias ??
      30,
  );
}

function getLastInteraction(row: CobrancaReguaRow) {
  return row.ultima_interacao_em ?? row.ultima_interacao_at ?? null;
}

function hasRecentDate(value: string | null | undefined, cooldownDias: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const limite = new Date();
  limite.setDate(limite.getDate() - cooldownDias);
  return date >= limite;
}

function normalizeFilter(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

async function fetchAllRows(
  buildQuery: (from: number, to: number) => any,
  errorPrefix: string,
) {
  const rows: any[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`${errorPrefix}: ${error.message}`);
    }

    const page = (data ?? []) as any[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function matchesSearch(row: CobrancaReguaRow, search?: string) {
  const q = normalizeFilter(search);
  if (!q) return true;

  const haystack = [
    row.condominios?.nome,
    row.unidades?.identificacao,
    row.unidades?.responsavel_nome,
    row.competencia,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function matchesContato(row: CobrancaReguaRow, contato?: string) {
  const mode = contato || "todos";
  const hasDestinatario = Boolean(row.unidades?.telefone || row.unidades?.email);

  if (mode === "com_destinatario") return hasDestinatario;
  if (mode === "sem_destinatario") return !hasDestinatario;
  return true;
}

function unidadeKey(row: CobrancaReguaRow) {
  return [
    row.condominio_id ?? row.condominios?.id ?? "",
    String(row.unidades?.bloco ?? "").trim().toLowerCase(),
    String(row.unidades?.identificacao ?? "").trim().toLowerCase(),
  ].join("|");
}

function responsavelApoioKey(row: any) {
  return [
    row.condominio_id ?? "",
    String(row.bloco ?? "").trim().toLowerCase(),
    String(row.unidade ?? "").trim().toLowerCase(),
  ].join("|");
}

async function loadResponsaveisApoioMap(
  supabase: ReturnType<typeof createAdminClient>,
  rows: CobrancaReguaRow[],
) {
  const condominioIds = [
    ...new Set(rows.map((row) => row.condominio_id ?? row.condominios?.id).filter(Boolean)),
  ];

  if (!condominioIds.length) return new Map<string, any>();

  const { data, error } = await supabase
    .from("responsaveis_unidades")
    .select("id, condominio_id, unidade, bloco, responsavel_nome, telefone, email, ativo")
    .eq("ativo", true)
    .in("condominio_id", condominioIds);

  if (error) {
    throw new Error(`Erro ao carregar responsÃ¡veis de apoio: ${error.message}`);
  }

  return new Map(((data ?? []) as any[]).map((row) => [responsavelApoioKey(row), row]));
}

function withResponsavelApoio(row: CobrancaReguaRow, apoioMap: Map<string, any>): CobrancaReguaRow {
  const apoio = apoioMap.get(unidadeKey(row));
  if (!apoio) return row;

  const unidade = row.unidades ?? {};
  return {
    ...row,
    unidades: {
      ...unidade,
      responsavel_nome: apoio.responsavel_nome || unidade.responsavel_nome,
      telefone: apoio.telefone || unidade.telefone,
      email: apoio.email || unidade.email,
    },
  };
}

async function criarLote(params: {
  supabase: ReturnType<typeof createAdminClient>;
  carteiraId: string;
  reguaId?: string | null;
  reguaReferencia: string;
  reguaOrigem: "cadastrada" | "padrao_interno";
  operadorId?: string | null;
  origem?: string;
  ciclo: string;
}) {
  let { data: lote, error } = await params.supabase
    .from("lotes")
    .insert({
      carteira_id: params.carteiraId,
      regua_id: params.reguaId ?? null,
      tipo: LOTE_TIPO.REGUA_COBRANCA,
      status: LOTE_STATUS.PROCESSANDO,
      operador_id: params.operadorId ?? null,
      observacoes: `Lote gerado pela régua de cobrança (${params.origem ?? "manual"}) · ciclo ${params.ciclo}.`,
      iniciado_em: new Date().toISOString(),
      total_avaliadas: 0,
      total_criadas: 0,
      total_puladas: 0,
      total_duplicadas: 0,
      total_erros: 0,
      total_pendentes: 0,
      total_aprovadas: 0,
      total_enviadas: 0,
      resumo: {
        origem: params.origem ?? "manual",
        ciclo: params.ciclo,
        regua_id: params.reguaReferencia,
        regua_origem: params.reguaOrigem,
      },
    } as any)
    .select("id")
    .single();

  if (error && (error.code === "PGRST204" || String(error.message ?? "").includes("regua_id"))) {
    const payloadSemReguaId = {
      carteira_id: params.carteiraId,
      tipo: LOTE_TIPO.REGUA_COBRANCA,
      status: LOTE_STATUS.PROCESSANDO,
      operador_id: params.operadorId ?? null,
      observacoes: `Lote gerado pela régua de cobrança (${params.origem ?? "manual"}) · ciclo ${params.ciclo}.`,
      iniciado_em: new Date().toISOString(),
      total_avaliadas: 0,
      total_criadas: 0,
      total_puladas: 0,
      total_duplicadas: 0,
      total_erros: 0,
      total_pendentes: 0,
      total_aprovadas: 0,
      total_enviadas: 0,
      resumo: {
        origem: params.origem ?? "manual",
        ciclo: params.ciclo,
        regua_id: params.reguaReferencia,
        regua_origem: params.reguaOrigem,
      },
    };

    const retry = await params.supabase
      .from("lotes")
      .insert(payloadSemReguaId as any)
      .select("id")
      .single();
    lote = retry.data;
    error = retry.error;
  }

  if (error || !lote?.id) {
    throw new Error(
      `Erro ao criar lote da régua: ${error?.message ?? "lote não retornado"}`,
    );
  }

  await registrarEventoOperacional(params.supabase as any, {
    carteiraId: params.carteiraId,
    entidadeTipo: "lote_mensagem",
    entidadeId: lote.id,
    eventoCodigo: "regua_cobranca.lote_criado",
    titulo: "Lote de régua criado",
    descricao: `Lote de cobrança criado para o ciclo ${params.ciclo}.`,
    severidade: "info",
    payload: { origem: params.origem ?? "manual", ciclo: params.ciclo },
    userId: params.operadorId ?? null,
  });

  return lote.id as string;
}

async function criarItemLote(params: {
  supabase: ReturnType<typeof createAdminClient>;
  loteId: string;
  row: CobrancaReguaRow;
  status: LoteItemStatus;
  motivo?: string;
  fingerprint?: string;
  reguaEtapaId?: string | null;
  mensagemId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const condominio = params.row.condominios;
  const unidade = params.row.unidades;

  const { data: item, error } = await params.supabase
    .from("lote_itens")
    .insert({
      lote_id: params.loteId,
      cobranca_id: params.row.id,
      unidade_id: unidade?.id ?? null,
      condominio_id: condominio?.id ?? null,
      regua_etapa_id: params.reguaEtapaId ?? null,
      mensagem_id: params.mensagemId ?? null,
      status: params.status,
      motivo: params.motivo ?? null,
      fingerprint: params.fingerprint ?? null,
      payload: params.payload ?? {},
    } as any)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Erro ao criar item do lote: ${error.message}`);
  }

  return item?.id ?? null;
}

async function atualizarLote(params: {
  supabase: ReturnType<typeof createAdminClient>;
  loteId: string;
  contadores: Contadores;
  reguaReferencia?: string;
  status?: string;
  erro?: string;
}) {
  const status = params.status ?? statusFinalDoLote(params.contadores);

  await params.supabase
    .from("lotes")
    .update({
      status,
      total_avaliadas: params.contadores.avaliadas,
      total_criadas: params.contadores.criadas,
      total_puladas: params.contadores.puladas,
      total_duplicadas: params.contadores.duplicadas,
      total_erros: params.contadores.erros,
      total_pendentes: params.contadores.criadas,
      total_aprovadas: 0,
      total_enviadas: 0,
      resumo: resumoContadores(params.contadores, {
        erro: params.erro ?? null,
        regua_id: params.reguaReferencia ?? null,
      }),
      finalizado_em: new Date().toISOString(),
    } as any)
    .eq("id", params.loteId);
}

async function getAcordosAtivosPorCobranca(
  supabase: ReturnType<typeof createAdminClient>,
  cobrancaIds: string[],
) {
  if (cobrancaIds.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from("acordos")
    .select("cobranca_id")
    .in("cobranca_id", cobrancaIds)
    .in("status", ACORDO_STATUS_VIGENTES as string[]);

  if (error) {
    throw new Error(`Erro ao verificar acordos ativos: ${error.message}`);
  }

  return new Set<string>((data ?? []).map((row: any) => String(row.cobranca_id)).filter(Boolean));
}

async function getUltimasMensagensPorCobranca(
  supabase: ReturnType<typeof createAdminClient>,
  cobrancaIds: string[],
) {
  const map = new Map<string, { id: string; created_at: string; status: string }>();
  if (cobrancaIds.length === 0) return map;

  const { data, error } = await supabase
    .from("mensagens")
    .select("id, cobranca_id, status, created_at")
    .in("cobranca_id", cobrancaIds)
    .neq("status", MENSAGEM_STATUS.CANCELADA)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erro ao verificar mensagens recentes: ${error.message}`);
  }

  for (const row of data ?? []) {
    const cobrancaId = (row as any).cobranca_id as string | null;
    if (cobrancaId && !map.has(cobrancaId)) {
      map.set(cobrancaId, {
        id: (row as any).id,
        created_at: (row as any).created_at,
        status: (row as any).status,
      });
    }
  }

  return map;
}

function avaliarElegibilidade(params: {
  row: CobrancaReguaRow;
  acordosAtivos: Set<string>;
  mensagensRecentes: Map<string, { id: string; created_at: string; status: string }>;
  cooldownDias: number;
}) {
  const row = params.row;
  const inicio = getInicioRegua(row);
  const diasAtraso = diasDesdeVencimento(row.vencimento);

  if (row.automacao_bloqueada) {
    return { elegivel: false, motivo: "Automação bloqueada na cobrança.", diasAtraso, inicio };
  }

  if (row.status_financeiro === COBRANCA_STATUS_FINANCEIRO.QUITADO) {
    return { elegivel: false, motivo: "Cobrança quitada.", diasAtraso, inicio };
  }

  if (params.acordosAtivos.has(row.id)) {
    return { elegivel: false, motivo: "Cobrança possui acordo ativo/vigente.", diasAtraso, inicio };
  }

  if (!isCobrancaElegivelParaRegua({ vencimento: row.vencimento, inicioCobrancaDias: inicio })) {
    return {
      elegivel: false,
      motivo: "Ainda não atingiu o D+ de início da régua.",
      diasAtraso,
      inicio,
    };
  }

  const ultimaMensagem = params.mensagensRecentes.get(row.id);
  if (ultimaMensagem && hasRecentDate(ultimaMensagem.created_at, params.cooldownDias)) {
    return {
      elegivel: false,
      motivo: `Mensagem recente encontrada nos últimos ${params.cooldownDias} dia(s).`,
      diasAtraso,
      inicio,
    };
  }

  const ultimaInteracao = getLastInteraction(row);
  if (hasRecentDate(ultimaInteracao, Math.min(params.cooldownDias, 2))) {
    return {
      elegivel: false,
      motivo: "Interação operacional muito recente.",
      diasAtraso,
      inicio,
    };
  }

  return { elegivel: true, motivo: null, diasAtraso, inicio };
}

export async function processarReguaCobranca(
  params: ProcessarReguaParams = {},
): Promise<ResultadoLoteRegua> {
  const supabase = createAdminClient();
  const total = novoContador();
  const itens: ResultadoLoteRegua["itens"] = [];
  const lotesPorCarteiraRegua = new Map<string, LoteContext>();
  const cooldownDias = Number(params.cooldownDias ?? 3);
  const ciclo = cicloReferencia();

  const data = await fetchAllRows((from, to) => {
    let query: any = supabase
      .from("cobrancas")
      .select(
        `
        id,
        condominio_id,
        carteira_id,
        competencia,
        vencimento,
        valor_original,
        valor_atualizado,
        status,
        status_operacional,
        status_financeiro,
        automacao_bloqueada,
        ultima_interacao_at,
        ultima_interacao_em,
        proxima_acao_em,
        condominios(id, nome, inicio_cobranca_dias, dias_apos_vencimento_regua, intensidade_regua, regua_cobranca_id),
        unidades(id, identificacao, bloco, responsavel_nome, telefone, email)
      `,
      )
      .in("status_operacional", COBRANCA_STATUS_OPERACIONAIS_ATIVOS as string[])
      .order("vencimento", { ascending: true })
      .range(from, to);

    if (params.scope) {
      query = applyCarteiraScope(query, params.scope.carteiraIds);
    }
    if (params.carteiraId) query = query.eq("carteira_id", params.carteiraId);
    if (params.condominioId) query = query.eq("condominio_id", params.condominioId);
    return query;
  }, "Erro ao buscar cobranças para régua");

  const normalizedRows = normalizeRelationsList((data ?? []) as any[], [
    "condominios",
    "unidades",
  ]) as CobrancaReguaRow[];
  const apoioMap = await loadResponsaveisApoioMap(supabase, normalizedRows);
  const selectedIds = params.cobrancaIds ? new Set(params.cobrancaIds) : null;
  const rows = normalizedRows
    .map((row) => withResponsavelApoio(row, apoioMap))
    .filter((row) => matchesSearch(row, params.q))
    .filter((row) => matchesContato(row, params.contato))
    .filter((row) => !selectedIds || selectedIds.has(row.id));

  const cobrancaIds = rows.map((row) => row.id).filter(Boolean);
  const [acordosAtivos, mensagensRecentes] = await Promise.all([
    getAcordosAtivosPorCobranca(supabase, cobrancaIds),
    getUltimasMensagensPorCobranca(supabase, cobrancaIds),
  ]);

  async function getLote(row: CobrancaReguaRow): Promise<LoteContext> {
    const carteiraId = row.carteira_id;
    if (!carteiraId) throw new Error("Cobrança sem carteira_id.");

    const reguaId = params.reguaId || row.condominios?.regua_cobranca_id || null;
    const reguaReferencia = reguaId ?? "default-cobranca";
    const loteKey = `${carteiraId}|${reguaReferencia}`;

    const atual = lotesPorCarteiraRegua.get(loteKey);
    if (atual) return atual;

    const id = await criarLote({
      supabase,
      carteiraId,
      reguaId,
      reguaReferencia,
      reguaOrigem: reguaId ? "cadastrada" : "padrao_interno",
      operadorId: params.scope?.userId,
      origem: params.origem ?? "manual",
      ciclo,
    });
    const novo = { id, carteiraId, reguaId, reguaReferencia, contadores: novoContador() };
    lotesPorCarteiraRegua.set(loteKey, novo);
    return novo;
  }

  try {
    for (const row of rows) {
      const lote = await getLote(row);
      total.avaliadas += 1;
      lote.contadores.avaliadas += 1;

      try {
        const condominio = row.condominios;
        const unidade = row.unidades;
        const avaliacao = avaliarElegibilidade({
          row,
          acordosAtivos,
          mensagensRecentes,
          cooldownDias,
        });

        const suspensao = await verificarSuspensaoRegua({
          carteiraId: row.carteira_id,
          cobrancaId: row.id,
          unidadeId: unidade?.id ?? null,
          condominioId: condominio?.id ?? null,
        });

        if (suspensao.pausada) {
          total.puladas += 1;
          lote.contadores.puladas += 1;
          itens.push({
            cobrancaId: row.id,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: suspensao.motivo ?? "Régua pausada para esta cobrança/unidade/condomínio.",
          });

          await criarItemLote({
            supabase,
            loteId: lote.id,
            row,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: suspensao.motivo ?? "Régua pausada para esta cobrança/unidade/condomínio.",
            payload: { origem: "suspensao_inteligente", suspensao },
          });
          continue;
        }

        if (!avaliacao.elegivel) {
          total.puladas += 1;
          lote.contadores.puladas += 1;
          itens.push({
            cobrancaId: row.id,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: avaliacao.motivo ?? "Cobrança não elegível.",
          });

          await criarItemLote({
            supabase,
            loteId: lote.id,
            row,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: avaliacao.motivo ?? "Cobrança não elegível.",
            payload: {
              dias_atraso: avaliacao.diasAtraso,
              inicio_cobranca_dias: avaliacao.inicio,
              cooldown_dias: cooldownDias,
              ciclo,
            },
          });
          continue;
        }

        const etapas = await carregarEtapasDeReguaAdmin(params.reguaId || condominio?.regua_cobranca_id);
        const etapa =
          selecionarEtapa({
            etapas,
            diasAtraso: avaliacao.diasAtraso,
            inicioCobrancaDias: avaliacao.inicio,
          }) ?? etapas[0];

        if (!etapa) {
          throw new Error("Nenhuma etapa de régua disponível.");
        }

        const canal = etapa.canal ?? "whatsapp";
        const intensidade = (condominio?.intensidade_regua ?? etapa.tom ?? "medio") as ReguaTom;
        const destinatario = canal === "email" ? unidade?.email : unidade?.telefone;
        const reguaEtapaId = normalizarEtapaId(etapa.id);
        const etapaReferencia = reguaEtapaId ?? etapa.id ?? null;
        const fingerprint = criarReguaFingerprint({
          contexto: "regua_cobranca",
          entidadeId: row.id,
          etapaId: etapaReferencia,
          canal,
          ciclo,
        });

        const contexto = {
          carteira: row.carteira_id,
          nome_carteira: row.carteira_id,
          responsavel: unidade?.responsavel_nome ?? "responsável",
          nome: unidade?.responsavel_nome ?? "responsável",
          primeiro_nome: String(unidade?.responsavel_nome ?? "responsável").split(" ")[0],
          unidade: unidade?.identificacao ?? "unidade",
          condominio: condominio?.nome ?? "condomínio",
          competencia: row.competencia ?? "",
          vencimento: formatDateBR(row.vencimento),
          valor: formatMoneyBR(row.valor_atualizado ?? row.valor_original),
          valor_total: formatMoneyBR(row.valor_atualizado ?? row.valor_original),
          dias_atraso: avaliacao.diasAtraso,
        };

        const templateResolvido = await resolveTemplateMensagem({
          carteiraId: row.carteira_id,
          tipoRegua: "cobranca",
          categoria: (etapa as any).categoria_template,
          intensidade,
          canal,
          templateId: (etapa as any).template_id,
          fallbackText: etapa.template,
          variables: contexto,
        });
        const mensagem = templateResolvido.renderizado || montarMensagem({
          tipo: "cobranca",
          etapa,
          intensidade,
          contexto,
        });

        const score = await salvarScoreRegua({
          carteiraId: row.carteira_id,
          cobrancaId: row.id,
          unidadeId: unidade?.id ?? null,
          condominioId: condominio?.id ?? null,
          valor: row.valor_atualizado ?? row.valor_original,
          diasAtraso: avaliacao.diasAtraso,
          canal,
        });

        const compliance = await avaliarComplianceRegua({
          carteiraId: row.carteira_id,
          condominioId: condominio?.id ?? null,
          unidadeId: unidade?.id ?? null,
          cobrancaId: row.id,
          destinatario,
          canal,
        });

        if (!compliance.permitido) {
          total.puladas += 1;
          lote.contadores.puladas += 1;
          itens.push({
            cobrancaId: row.id,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: compliance.motivo ?? "Bloqueado por regra de compliance.",
          });

          await criarItemLote({
            supabase,
            loteId: lote.id,
            row,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: compliance.motivo ?? "Bloqueado por regra de compliance.",
            fingerprint,
            reguaEtapaId,
            payload: { mensagem, canal, destinatario, contexto, score, compliance, ciclo },
          });
          continue;
        }

        if (!destinatario) {
          total.puladas += 1;
          lote.contadores.puladas += 1;
          itens.push({
            cobrancaId: row.id,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: "Responsável sem destinatário para o canal selecionado.",
          });

          await criarItemLote({
            supabase,
            loteId: lote.id,
            row,
            status: LOTE_ITEM_STATUS.PULADA,
            motivo: "Responsável sem destinatário para o canal selecionado.",
            fingerprint,
            reguaEtapaId,
            payload: {
              mensagem,
              canal,
              destinatario,
              contexto,
              etapa_default_id: etapa.id,
              template_resolvido: templateResolvido,
              score,
              compliance,
              ciclo,
            },
          });
          continue;
        }

        const { data: mensagemExistente } = await supabase
          .from("mensagens")
          .select("id")
          .eq("fingerprint", fingerprint)
          .limit(1)
          .maybeSingle();

        if (mensagemExistente?.id) {
          total.duplicadas += 1;
          lote.contadores.duplicadas += 1;
          itens.push({
            cobrancaId: row.id,
            status: LOTE_ITEM_STATUS.DUPLICADA,
            motivo: "Mensagem já existia para esta cobrança/etapa/canal/ciclo.",
          });

          await criarItemLote({
            supabase,
            loteId: lote.id,
            row,
            status: LOTE_ITEM_STATUS.DUPLICADA,
            motivo: "Mensagem já existia para esta cobrança/etapa/canal/ciclo.",
            fingerprint,
            reguaEtapaId,
            mensagemId: mensagemExistente.id,
            payload: {
              canal,
              destinatario,
              contexto,
              etapa_default_id: etapa.id,
              template_resolvido: templateResolvido,
              score,
              compliance,
              ciclo,
            },
          });
          continue;
        }

        const { data: mensagemCriada, error: mensagemError } = await supabase
          .from("mensagens")
          .insert({
            carteira_id: row.carteira_id,
            contexto: "cobranca",
            cobranca_id: row.id,
            canal,
            destinatario,
            conteudo: mensagem,
            conteudo_renderizado: mensagem,
            status: MENSAGEM_STATUS.PENDENTE_APROVACAO,
            status_operacional: MENSAGEM_STATUS.PENDENTE_APROVACAO,
            scheduled_at: new Date().toISOString(),
            agendada_para: new Date().toISOString(),
            lote_id: lote.id,
            regua_etapa_id: reguaEtapaId,
            fingerprint,
            template_id: templateResolvido.templateId,
            payload: {
              origem: "regua_cobranca",
              ciclo,
              etapa_id: etapa.id,
              template_resolvido: templateResolvido,
              dias_atraso: avaliacao.diasAtraso,
              inicio_cobranca_dias: avaliacao.inicio,
              score,
              compliance,
            },
          } as any)
          .select("id")
          .single();

        if (mensagemError) throw new Error(mensagemError.message);

        const loteItemId = await criarItemLote({
          supabase,
          loteId: lote.id,
          row,
          status: LOTE_ITEM_STATUS.CRIADO,
          motivo: "Mensagem criada com sucesso e pendente de aprovação.",
          fingerprint,
          reguaEtapaId,
          mensagemId: mensagemCriada.id,
          payload: {
            canal,
            destinatario,
            contexto,
            etapa_default_id: etapa.id,
            template_resolvido: templateResolvido,
            ciclo,
          },
        });

        if (loteItemId) {
          await supabase
            .from("mensagens")
            .update({ lote_item_id: loteItemId } as any)
            .eq("id", mensagemCriada.id);
        }

        await registrarEventoOperacional(supabase as any, {
          carteiraId: row.carteira_id,
          entidadeTipo: "cobranca",
          entidadeId: row.id,
          eventoCodigo: "regua_cobranca.mensagem_gerada",
          titulo: "Mensagem de régua gerada",
          descricao: `Mensagem criada para ${canal}, ciclo ${ciclo}.`,
          severidade: "info",
          payload: {
            lote_id: lote.id,
            lote_item_id: loteItemId,
            mensagem_id: mensagemCriada.id,
            fingerprint,
            ciclo,
            canal,
            etapa_id: etapa.id,
          },
          userId: params.scope?.userId ?? null,
        });

        total.criadas += 1;
        lote.contadores.criadas += 1;
        itens.push({
          cobrancaId: row.id,
          status: LOTE_ITEM_STATUS.CRIADO,
          mensagemId: mensagemCriada.id,
        });
      } catch (itemError) {
        const motivo =
          itemError instanceof Error
            ? itemError.message
            : "Erro inesperado ao processar cobrança.";
        total.erros += 1;
        lote.contadores.erros += 1;
        itens.push({ cobrancaId: row.id, status: LOTE_ITEM_STATUS.ERRO, motivo });

        await criarItemLote({
          supabase,
          loteId: lote.id,
          row,
          status: LOTE_ITEM_STATUS.ERRO,
          motivo,
          payload: { erro: motivo, ciclo },
        });
      }
    }

    for (const lote of lotesPorCarteiraRegua.values()) {
      await atualizarLote({ supabase, loteId: lote.id, contadores: lote.contadores, reguaReferencia: lote.reguaReferencia });
    }

    const loteIds = Array.from(lotesPorCarteiraRegua.values()).map((lote) => lote.id);

    return {
      loteId: loteIds[0] ?? "",
      loteIds,
      totalAvaliadas: total.avaliadas,
      totalCriadas: total.criadas,
      totalPuladas: total.puladas,
      totalDuplicadas: total.duplicadas,
      totalErros: total.erros,
      itens,
    };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "Erro inesperado ao processar lote.";
    for (const lote of lotesPorCarteiraRegua.values()) {
      await atualizarLote({
        supabase,
        loteId: lote.id,
        contadores: lote.contadores,
        reguaReferencia: lote.reguaReferencia,
        status: LOTE_STATUS.ERRO,
        erro: motivo,
      });
    }
    throw error;
  }
}
