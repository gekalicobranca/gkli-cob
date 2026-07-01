import { Building2, ExternalLink, KeyRound, ShieldCheck, UsersRound } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/utils/auth/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

type PortalVinculoRow = {
  id: string;
  condominio_id: string | null;
  portal_sindico_usuarios?: { nome: string | null; email: string | null } | { nome: string | null; email: string | null }[] | null;
  condominios?: { nome: string | null; administradora: string | null } | { nome: string | null; administradora: string | null }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

async function getVisaoSindicoResumo() {
  const admin = createAdminClient();

  const [usuariosResult, vinculosResult] = await Promise.all([
    admin.from("portal_sindico_usuarios").select("id, nome, email").order("created_at", { ascending: false }),
    admin
      .from("portal_sindico_condominios")
      .select("id, condominio_id, portal_sindico_usuarios(nome,email), condominios:condominio_id (nome, administradora)")
      .order("created_at", { ascending: false }),
  ]);

  if (usuariosResult.error) {
    throw new Error(`Erro ao carregar usuários do portal do síndico: ${usuariosResult.error.message}`);
  }

  if (vinculosResult.error) {
    throw new Error(`Erro ao carregar vínculos do portal do síndico: ${vinculosResult.error.message}`);
  }

  const usuarios = (usuariosResult.data ?? []) as Array<{ id: string; nome: string | null; email: string | null }>;
  const vinculos = (vinculosResult.data ?? []) as PortalVinculoRow[];
  const condominiosLiberados = new Set(vinculos.map((item) => item.condominio_id).filter(Boolean));

  return {
    usuarios,
    vinculos,
    condominiosLiberados: condominiosLiberados.size,
  };
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
}) {
  return (
    <Card className="min-h-[118px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f6fb] text-[#04799a]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

export default async function VisaoSindicoPage() {
  await requireAdmin();
  const resumo = await getVisaoSindicoResumo();
  const ultimosVinculos = resumo.vinculos.slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Acompanhamento do portal separado do síndico, com visão consolidada dos acessos liberados."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink href="/sindico/login" target="_blank" variant="secondary">
              <ExternalLink className="h-4 w-4" />
              Portal do síndico
            </ButtonLink>
            <ButtonLink href="/app/gestao/visao-sindico/acessos">
              <KeyRound className="h-4 w-4" />
              Acessos
            </ButtonLink>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          title="Usuários"
          value={formatNumber(resumo.usuarios.length)}
          note="síndicos cadastrados no portal"
          icon={UsersRound}
        />
        <MetricCard
          title="Condomínios"
          value={formatNumber(resumo.condominiosLiberados)}
          note="condomínios liberados para consulta"
          icon={Building2}
        />
        <MetricCard
          title="Separação"
          value="Ativa"
          note="portal sem acesso ao operacional"
          icon={ShieldCheck}
        />
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Condomínios liberados</h2>
          <p className="mt-1 text-sm text-slate-500">Resumo dos vínculos que alimentam o painel separado do síndico.</p>
        </div>

        {ultimosVinculos.length ? (
          <div className="divide-y divide-slate-100">
            {ultimosVinculos.map((vinculo) => {
              const usuario = firstRelation(vinculo.portal_sindico_usuarios);
              const condominio = firstRelation(vinculo.condominios);

              return (
                <div key={vinculo.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_minmax(220px,.8fr)_180px] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{condominio?.nome ?? "Condomínio não informado"}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{condominio?.administradora ?? "Administradora não informada"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Síndico</p>
                    <p className="mt-1 truncate text-sm text-slate-700">{usuario?.nome ?? usuario?.email ?? "Usuário não informado"}</p>
                  </div>
                  <div>
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      liberado
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhum condomínio liberado para síndico ainda.
          </div>
        )}
      </Card>
    </div>
  );
}
