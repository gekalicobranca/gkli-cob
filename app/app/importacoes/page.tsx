import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gavel,
  Home,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/data/empty-state";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { limparHistoricoImportacoes } from "@/features/importacoes/actions";
import { listImportacoes } from "@/features/importacoes/queries";
import { LimparHistoricoImportacoesButton } from "./limpar-historico-importacoes-button";

const importCards = [
  {
    tipo: "condominios",
    title: "Condomínios",
    description:
      "Cadastro base por carteira, CNPJ, administradora e início da cobrança.",
    icon: Building2,
    templateHref: "/templates/importacao-condominios.xlsx",
    guardrail: "Deduplica CNPJ no arquivo: mantém a primeira linha e bloqueia repetidas.",
    impact: "Base cadastral",
  },
  {
    tipo: "unidades",
    title: "Responsáveis",
    description:
      "Cadastro de apoio por CNPJ do condomínio, unidade, responsável e canais de contato.",
    icon: Home,
    templateHref: "/templates/importacao-unidades.xlsx",
    guardrail:
      "Atualiza responsáveis por condomínio/bloco/unidade sem criar unidade operacional.",
    impact: "Contatos de apoio",
  },
  {
    tipo: "cobrancas",
    title: "Cobranças",
    description:
      "Débitos em aberto, competência, vencimento, valores e validação operacional.",
    icon: ClipboardCheck,
    templateHref: "/templates/importacao-cobrancas.xlsx",
    guardrail: "Calcula impacto financeiro e bloqueia cobrança sem vínculo seguro.",
    impact: "Carteira ativa",
  },
  {
    tipo: "acordos_extra",
    title: "Legado · Acordos extra",
    description:
      "Acordos extrajudiciais anteriores, parcelas, status, documentos e histórico.",
    icon: Scale,
    templateHref: "/templates/importacao-acordos-extra.xlsx",
    guardrail: "Cria acordo e parcelas somente depois do preview confirmado.",
    impact: "Migração histórica",
  },
  {
    tipo: "acordos_judiciais",
    title: "Legado · Acordos judiciais",
    description:
      "Acordos judiciais com processo, valores, parcelas e vínculo histórico.",
    icon: Gavel,
    templateHref: "/templates/importacao-acordos-judiciais.xlsx",
    guardrail: "Exige processo e vínculo por CNPJ/unidade antes de liberar.",
    impact: "Controle judicial",
  },
];

const activeImportCards = importCards.filter(
  (card) => card.tipo !== "acordos_extra" && card.tipo !== "acordos_judiciais",
);

function labelTipo(tipo: string) {
  return importCards.find((card) => card.tipo === tipo)?.title ?? tipo;
}

export default async function ImportacoesPage() {
  const scope = await getPermittedCarteiras();
  const rows = await listImportacoes(scope);
  const concluidas = rows.filter((row: any) => row.status === "confirmada").length;
  const erro = rows.filter((row: any) => row.status === "erro").length;
  const pendentes = rows.filter(
    (row: any) => row.status !== "confirmada" && row.status !== "erro",
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Importações"
        description="Cockpit seguro de entrada de dados da GKLI: validar, revisar, confirmar e rastrear cada carga antes de gravar dados definitivos."
        actions={
          <ButtonLink
            href="/app/importacoes/nova?tipo=cobrancas"
            className="!text-white [&_svg]:!text-white"
          >
            <Plus size={16} />
            Nova importação
          </ButtonLink>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-emerald-50 p-2 text-emerald-700">
            <CheckCircle2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Concluídas
          </p>
          <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">
            {concluidas}
          </p>
          <p className="mt-1 text-sm text-slate-500">aplicadas na base</p>
        </Card>
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-amber-50 p-2 text-amber-700">
            <FileCheck2 size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Em revisão
          </p>
          <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">
            {pendentes}
          </p>
          <p className="mt-1 text-sm text-slate-500">previews pendentes</p>
        </Card>
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-red-50 p-2 text-red-700">
            <ShieldAlert size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Com erro
          </p>
          <p className="mt-3 text-3xl font-medium tracking-tight text-slate-950">
            {erro}
          </p>
          <p className="mt-1 text-sm text-slate-500">precisam correção</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {activeImportCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.tipo}
              className="group flex h-full flex-col justify-between overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-[var(--gkli-primary)]/35 hover:shadow-[0_22px_50px_-36px_rgba(15,23,42,.55)]"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-3 text-[var(--gkli-primary)]">
                    <Icon size={21} />
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                    Validação rígida
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-medium tracking-tight text-slate-950">
                  {card.title}
                </h2>
                <p className="mt-2 min-h-[48px] text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <p className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                    <ShieldCheck
                      size={14}
                      className="mt-0.5 shrink-0 text-[var(--gkli-primary)]"
                    />
                    {card.guardrail}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Impacto: {card.impact}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row">
                <ButtonLink
                  href={`/app/importacoes/nova?tipo=${card.tipo}`}
                  className="justify-center !text-white [&_svg]:!text-white"
                >
                  <Plus size={16} />
                  Importar
                </ButtonLink>
                <ButtonLink
                  href={card.templateHref}
                  variant="secondary"
                  className="justify-center"
                  download
                >
                  <Table2 size={16} />
                  Baixar template
                </ButtonLink>
              </div>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Histórico de importações
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Revise preview, erros, alertas e aplicação de cada arquivo.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative md:w-[360px]">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input className="pl-9" placeholder="Buscar arquivo..." />
              </div>
              {rows.length > 0 ? (
                <form action={limparHistoricoImportacoes}>
                  <LimparHistoricoImportacoesButton total={rows.length} />
                </form>
              ) : null}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma importação encontrada"
              description="Faça upload de arquivos para iniciar o fluxo de preview seguro."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link
                key={row.id}
                href={`/app/importacoes/${row.id}`}
                className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_130px_160px_160px_80px] xl:items-center"
              >
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {row.arquivo_nome ?? "Arquivo sem nome"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {labelTipo(row.tipo)} ·{" "}
                    {formatCurrency(Number(row.resumo?.valor_total_valido ?? 0))}
                  </p>
                </div>
                <StatusBadge status={row.status} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Validação
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {row.total_validas}/{row.total_linhas}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Criada em
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {formatDateBR(row.created_at)}
                  </p>
                </div>
                <div className="flex justify-end">
                  <ArrowUpRight
                    size={16}
                    className="text-slate-400 group-hover:text-[var(--gkli-primary)]"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
