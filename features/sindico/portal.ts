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

export type SindicoPortalOverview = {
  user: SindicoUser;
  portalUser: {
    id: string;
    nome: string;
    email: string;
    status: string;
  } | null;
  condominios: SindicoPortalCondominio[];
  totals: {
    condominios: number;
    cobrancasAbertas: number;
    valorEmAberto: number;
    acordosAtivos: number;
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

export async function getSindicoPortalOverview(): Promise<SindicoPortalOverview> {
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
      condominios: [],
      totals: {
        condominios: 0,
        cobrancasAbertas: 0,
        valorEmAberto: 0,
        acordosAtivos: 0,
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

  if (condominioIds.length > 0) {
    const { data: cobrancas, error: cobrancasError } = await admin
      .from("cobrancas")
      .select("id, condominio_id, valor_atualizado, valor_original, status, status_operacional")
      .in("condominio_id", condominioIds);

    if (cobrancasError) {
      throw new Error(`Erro ao carregar cobrancas do portal: ${cobrancasError.message}`);
    }

    for (const cobranca of cobrancas ?? []) {
      const condominioId = (cobranca as any).condominio_id;
      const status = String((cobranca as any).status_operacional ?? (cobranca as any).status ?? "").toLowerCase();
      if (!condominioId || ["quitado", "cancelado", "baixado"].includes(status)) continue;

      const current = cobrancasByCondominio.get(condominioId) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += Number((cobranca as any).valor_atualizado ?? (cobranca as any).valor_original ?? 0);
      cobrancasByCondominio.set(condominioId, current);
    }

    const { data: acordos, error: acordosError } = await admin
      .from("acordos")
      .select("id, condominio_id, status")
      .in("condominio_id", condominioIds);

    if (acordosError) {
      throw new Error(`Erro ao carregar acordos do portal: ${acordosError.message}`);
    }

    for (const acordo of acordos ?? []) {
      const condominioId = (acordo as any).condominio_id;
      const status = String((acordo as any).status ?? "").toLowerCase();
      if (!condominioId || ["rompido", "cancelado", "quitado"].includes(status)) continue;
      acordosByCondominio.set(condominioId, (acordosByCondominio.get(condominioId) ?? 0) + 1);
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
    condominios,
    totals: {
      condominios: condominios.length,
      cobrancasAbertas: condominios.reduce((sum, item) => sum + item.cobrancasAbertas, 0),
      valorEmAberto: condominios.reduce((sum, item) => sum + item.valorEmAberto, 0),
      acordosAtivos: condominios.reduce((sum, item) => sum + item.acordosAtivos, 0),
    },
  };
}
