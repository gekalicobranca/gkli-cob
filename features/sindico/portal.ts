import { redirect } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUser } from "@/utils/auth/get-current-user";

type SindicoUser = {
  id: string;
  email: string;
  nome: string;
  perfil: string;
};

export type SindicoPortalCondominio = {
  id: string;
  nome: string;
  administradora: string | null;
  perfil: string;
  status: string;
  cobrancasAbertas: number;
  valorEmAberto: number;
  acordosAtivos: number;
};

export type SindicoPortalMode = "ativos" | "todos";

export type SindicoPortalAceite = {
  id: string;
  acordoId: string;
  tipo: string;
  status: string;
  titulo: string;
  destinatarioNome: string | null;
  destinatarioEmail: string | null;
  condominioNome: string;
  unidadeLabel: string;
  valorAcordado: number;
  criadoEm: string | null;
  visualizadoEm: string | null;
  aceitoEm: string | null;
};

export type SindicoPortalAcordo = {
  id: string;
  condominioNome: string;
  unidadeLabel: string;
  responsavelNome: string | null;
  valorAcordado: number;
  quantidadeParcelas: number | null;
  dataAcordo: string | null;
  status: string | null;
  fluxoStatus: string | null;
  exigeAprovacaoSindico: boolean;
  sindicoAprovadoEm: string | null;
  devedorAceitoEm: string | null;
};

export type SindicoPortalCobranca = {
  id: string;
  condominioNome: string;
  unidadeLabel: string;
  responsavelNome: string | null;
  competencia: string | null;
  vencimento: string | null;
  valorOriginal: number;
  valorAtualizado: number;
  status: string | null;
  statusOperacional: string | null;
  statusFinanceiro: string | null;
};

export type SindicoPortalOverview = {
  user: SindicoUser;
  portalUser: {
    id: string;
    nome: string;
    email: string;
    status: string;
  } | null;
  mode: SindicoPortalMode;
  condominios: SindicoPortalCondominio[];
  aceites: SindicoPortalAceite[];
  acordos: SindicoPortalAcordo[];
  cobrancas: SindicoPortalCobranca[];
  totals: {
    condominios: number;
    cobrancasAbertas: number;
    valorEmAberto: number;
    acordosAtivos: number;
    aceitesPendentes: number;
  };
};

export async function requireSindicoUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sindico/login");
  }

  if (user.perfil !== "sindico") {
    redirect("/app");
  }

  return user as SindicoUser;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function unidadeLabel(unidade: any) {
  return [
    unidade?.bloco ? `Bloco ${unidade.bloco}` : null,
    unidade?.identificacao ? `Unidade ${unidade.identificacao}` : null,
  ].filter(Boolean).join(" - ") || "Unidade nao informada";
}

function isActiveCobranca(row: any) {
  const status = String(row?.status_operacional ?? row?.status ?? "").toLowerCase();
  return !["quitado", "cancelado", "baixado"].includes(status);
}

function isActiveAcordo(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return !["rompido", "cancelado", "quitado"].includes(status);
}

function isPendingTermo(row: any) {
  return ["pendente", "visualizado"].includes(String(row?.status ?? "").toLowerCase());
}

export function normalizeSindicoPortalMode(value?: string | string[] | null): SindicoPortalMode {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === "todos" ? "todos" : "ativos";
}

export async function getSindicoPortalOverview(mode: SindicoPortalMode = "ativos"): Promise<SindicoPortalOverview> {
  const user = await requireSindicoUser();
  const admin = createAdminClient();

  const { data: portalUser, error: portalUserError } = await admin
    .from("portal_sindico_usuarios")
    .select("id, nome, email, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (portalUserError) {
    throw new Error(`Erro ao carregar acesso do sindico: ${portalUserError.message}`);
  }

  if (!portalUser || portalUser.status !== "ativo") {
    return {
      user,
      portalUser: portalUser as any,
      mode,
      condominios: [],
      aceites: [],
      acordos: [],
      cobrancas: [],
      totals: {
        condominios: 0,
        cobrancasAbertas: 0,
        valorEmAberto: 0,
        acordosAtivos: 0,
        aceitesPendentes: 0,
      },
    };
  }

  const { data: vinculos, error: vinculosError } = await admin
    .from("portal_sindico_condominios")
    .select("id, perfil, status, condominio_id, condominios:condominio_id (id, nome, administradora)")
    .eq("portal_usuario_id", portalUser.id)
    .eq("status", "ativo")
    .order("created_at", { ascending: true });

  if (vinculosError) {
    throw new Error(`Erro ao carregar condominios do sindico: ${vinculosError.message}`);
  }

  const condominioIds = uniqueStrings((vinculos ?? []).map((item: any) => item.condominio_id));
  const cobrancasByCondominio = new Map<string, { count: number; value: number }>();
  const acordosByCondominio = new Map<string, number>();
  let cobrancasRows: any[] = [];
  let acordosRows: any[] = [];
  let termosRows: any[] = [];

  if (condominioIds.length > 0) {
    const { data: cobrancas, error: cobrancasError } = await admin
      .from("cobrancas")
      .select(`
        id,
        condominio_id,
        unidade_id,
        competencia,
        vencimento,
        valor_atualizado,
        valor_original,
        status,
        status_operacional,
        status_financeiro,
        condominios:condominio_id (id, nome),
        unidades:unidade_id (id, identificacao, bloco, responsavel_nome)
      `)
      .in("condominio_id", condominioIds)
      .order("vencimento", { ascending: true });

    if (cobrancasError) {
      throw new Error(`Erro ao carregar cobrancas do portal: ${cobrancasError.message}`);
    }

    cobrancasRows = (cobrancas ?? []) as any[];

    for (const cobranca of cobrancasRows) {
      const condominioId = (cobranca as any).condominio_id;
      if (!condominioId || !isActiveCobranca(cobranca)) continue;

      const current = cobrancasByCondominio.get(condominioId) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += Number((cobranca as any).valor_atualizado ?? (cobranca as any).valor_original ?? 0);
      cobrancasByCondominio.set(condominioId, current);
    }

    const { data: acordos, error: acordosError } = await admin
      .from("acordos")
      .select(`
        id,
        condominio_id,
        unidade_id,
        valor_acordado,
        quantidade_parcelas,
        data_acordo,
        status,
        fluxo_status,
        exige_aprovacao_sindico,
        sindico_aprovado_em,
        devedor_aceito_em,
        condominios:condominio_id (id, nome),
        unidades:unidade_id (id, identificacao, bloco, responsavel_nome)
      `)
      .in("condominio_id", condominioIds)
      .order("data_acordo", { ascending: false });

    if (acordosError) {
      throw new Error(`Erro ao carregar acordos do portal: ${acordosError.message}`);
    }

    acordosRows = (acordos ?? []) as any[];

    for (const acordo of acordosRows) {
      const condominioId = (acordo as any).condominio_id;
      if (!condominioId || !isActiveAcordo(acordo)) continue;
      acordosByCondominio.set(condominioId, (acordosByCondominio.get(condominioId) ?? 0) + 1);
    }

    const acordoIds = uniqueStrings(acordosRows.map((acordo: any) => acordo.id));

    if (acordoIds.length > 0) {
      const { data: termos, error: termosError } = await admin
        .from("acordos_termos")
        .select("id, acordo_id, tipo_aceite, status, titulo, destinatario_nome, destinatario_email, visualizado_em, aceito_em, created_at, expira_em")
        .in("acordo_id", acordoIds)
        .order("created_at", { ascending: false });

      if (termosError) {
        throw new Error(`Erro ao carregar aceites do portal: ${termosError.message}`);
      }

      termosRows = (termos ?? []) as any[];
    }
  }

  const condominios = (vinculos ?? []).map((vinculo: any) => {
    const condominio = Array.isArray(vinculo.condominios) ? vinculo.condominios[0] : vinculo.condominios;
    const condominioId = condominio?.id ?? vinculo.condominio_id;
    const cobrancas = cobrancasByCondominio.get(condominioId) ?? { count: 0, value: 0 };

    return {
      id: condominioId,
      nome: condominio?.nome ?? "Condominio nao informado",
      administradora: condominio?.administradora ?? null,
      perfil: vinculo.perfil ?? "sindico",
      status: vinculo.status ?? "ativo",
      cobrancasAbertas: cobrancas.count,
      valorEmAberto: cobrancas.value,
      acordosAtivos: acordosByCondominio.get(condominioId) ?? 0,
    };
  });

  return {
    user,
    portalUser: portalUser as any,
    mode,
    condominios,
    aceites: termosRows
      .filter((termo) => mode === "todos" || isPendingTermo(termo))
      .map((termo) => {
        const acordo = acordosRows.find((item: any) => item.id === termo.acordo_id);
        const condominio = one(acordo?.condominios);
        const unidade = one(acordo?.unidades);

        return {
          id: termo.id,
          acordoId: termo.acordo_id,
          tipo: termo.tipo_aceite,
          status: termo.status,
          titulo: termo.titulo,
          destinatarioNome: termo.destinatario_nome ?? null,
          destinatarioEmail: termo.destinatario_email ?? null,
          condominioNome: condominio?.nome ?? "Condominio nao informado",
          unidadeLabel: unidadeLabel(unidade),
          valorAcordado: Number(acordo?.valor_acordado ?? 0),
          criadoEm: termo.created_at ?? null,
          visualizadoEm: termo.visualizado_em ?? null,
          aceitoEm: termo.aceito_em ?? null,
        };
      }),
    acordos: acordosRows
      .filter((acordo) => mode === "todos" || isActiveAcordo(acordo))
      .map((acordo) => {
        const condominio = one(acordo.condominios);
        const unidade = one(acordo.unidades);

        return {
          id: acordo.id,
          condominioNome: condominio?.nome ?? "Condominio nao informado",
          unidadeLabel: unidadeLabel(unidade),
          responsavelNome: unidade?.responsavel_nome ?? null,
          valorAcordado: Number(acordo.valor_acordado ?? 0),
          quantidadeParcelas: acordo.quantidade_parcelas ?? null,
          dataAcordo: acordo.data_acordo ?? null,
          status: acordo.status ?? null,
          fluxoStatus: acordo.fluxo_status ?? null,
          exigeAprovacaoSindico: Boolean(acordo.exige_aprovacao_sindico),
          sindicoAprovadoEm: acordo.sindico_aprovado_em ?? null,
          devedorAceitoEm: acordo.devedor_aceito_em ?? null,
        };
      }),
    cobrancas: cobrancasRows
      .filter((cobranca) => mode === "todos" || isActiveCobranca(cobranca))
      .map((cobranca) => {
        const condominio = one(cobranca.condominios);
        const unidade = one(cobranca.unidades);

        return {
          id: cobranca.id,
          condominioNome: condominio?.nome ?? "Condominio nao informado",
          unidadeLabel: unidadeLabel(unidade),
          responsavelNome: unidade?.responsavel_nome ?? null,
          competencia: cobranca.competencia ?? null,
          vencimento: cobranca.vencimento ?? null,
          valorOriginal: Number(cobranca.valor_original ?? 0),
          valorAtualizado: Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0),
          status: cobranca.status ?? null,
          statusOperacional: cobranca.status_operacional ?? null,
          statusFinanceiro: cobranca.status_financeiro ?? null,
        };
      }),
    totals: {
      condominios: condominios.length,
      cobrancasAbertas: condominios.reduce((sum, item) => sum + item.cobrancasAbertas, 0),
      valorEmAberto: condominios.reduce((sum, item) => sum + item.valorEmAberto, 0),
      acordosAtivos: condominios.reduce((sum, item) => sum + item.acordosAtivos, 0),
      aceitesPendentes: termosRows.filter(isPendingTermo).length,
    },
  };
}
