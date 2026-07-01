import Link from "next/link";
import { AlertTriangle, ArrowRightLeft, ArrowUpRight, Search } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { CondominioSearchSelect } from "@/components/gestao/condominio-search-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { alterarUnidadeCobrancaPeloSaneamento } from "@/features/saneamento-cobrancas/actions";
import {
  listCobrancasParaCorrecaoUnidade,
  listCondominiosParaSaneamento,
  listPossiveisUnidadesDuplicadas,
  listUnidadesDestinoCorrecao,
} from "@/features/saneamento-cobrancas/queries";
import { listCobrancas } from "@/features/cobrancas/queries";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function unidadeLabel(row: any) {
  const bloco = row.unidades?.bloco ? `${row.unidades.bloco} ` : "";
  return `${bloco}${row.unidades?.identificacao ?? "-"}`.trim();
}

function unidadeCompleta(unidade: any) {
  const bloco = unidade?.bloco ? `Bloco ${unidade.bloco} · ` : "";
  const contato = [unidade?.responsavel_nome, unidade?.email, unidade?.telefone].filter(Boolean).join(" · ");
  return `Unidade ${bloco}${unidade?.identificacao ?? "-"}${contato ? ` · ${contato}` : ""}`;
}

function contatoResumo(unidade: any) {
  return [unidade?.responsavel_nome, unidade?.email, unidade?.telefone].filter(Boolean).join(" · ") || "Sem responsável/contato";
}

function cobrancaUrl(row: any, params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.set("cobranca_id", row.id);
  next.set("condominio_id", row.condominio_id);
  return `/app/gestao/saneamento-cobrancas?${next.toString()}`;
}

export default async function SaneamentoCobrancasPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = getParam(params, "q");
  const condominioId = getParam(params, "condominio_id");
  const cobrancaId = getParam(params, "cobranca_id");
  const scope = await getPermittedCarteiras();

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (condominioId) baseParams.set("condominio_id", condominioId);

  const [condominios, correcaoRows, selectedRows, judicialRows, duplicidadeRows] = await Promise.all([
    listCondominiosParaSaneamento(scope),
    listCobrancasParaCorrecaoUnidade(scope, { q, condominioId }),
    cobrancaId ? listCobrancasParaCorrecaoUnidade(scope, { cobrancaId }) : Promise.resolve([]),
    listCobrancas(scope, { judicializacaoUnidade: "sim" }),
    listPossiveisUnidadesDuplicadas(scope, { q, condominioId }),
  ]);

  const selectedCobranca = selectedRows[0] ?? null;
  const unidadesDestino = selectedCobranca
    ? await listUnidadesDestinoCorrecao(scope, selectedCobranca.condominio_id)
    : [];

  const totalJudicializado = judicialRows.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0);
  const unidadesJudicializadas = new Set(judicialRows.map((row: any) => row.unidade_id).filter(Boolean)).size;
  const condominiosJudicializados = new Set(judicialRows.map((row: any) => row.condominio_id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Saneamento de cobranças"
        description="Corrija vínculos de cobrança com unidade, revise duplicidades cadastrais e mantenha a trilha operacional auditável."
        actions={<ButtonLink href="/app/cobrancas">Abrir cobranças</ButtonLink>}
      />

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Correção cadastral</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Alterar unidade da cobrança</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Use quando uma importação vinculou a cobrança a uma unidade duplicada ou sem cadastro de responsável. A unidade destino precisa ser do mesmo condomínio.
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
            Não remove unidades duplicadas automaticamente
          </div>
        </div>

        <form className="mt-5 grid gap-3 lg:grid-cols-[1fr_280px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input name="q" defaultValue={q} placeholder="Buscar por Rio Negro, unidade, responsável, status..." className="pl-9" />
          </div>
          <CondominioSearchSelect
            name="condominio_id"
            options={condominios.map((condominio) => ({
              id: condominio.id,
              nome: condominio.nome,
              administradora: null,
            }))}
            selectedId={condominioId}
            defaultToFirst={false}
            inputClassName=""
          />
          <Button type="submit" variant="secondary" className="lg:w-auto">
            Filtrar
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Cobranças encontradas</h3>
            <p className="mt-1 text-sm text-slate-500">Selecione a cobrança que precisa mudar de unidade.</p>
          </div>

          {correcaoRows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nenhuma cobrança encontrada" description="Ajuste a busca ou filtre por condomínio para localizar a cobrança." />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {correcaoRows.map((row: any) => {
                const selected = row.id === selectedCobranca?.id;
                return (
                  <div key={row.id} className={["grid gap-4 px-5 py-4 xl:grid-cols-[minmax(260px,1fr)_120px_120px_120px] xl:items-center", selected ? "bg-cyan-50/70" : "hover:bg-slate-50"].join(" ")}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{row.condominios?.nome ?? "Condomínio não informado"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        Unidade {unidadeLabel(row)} · {row.unidades?.responsavel_nome ?? "Responsável não informado"}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {row.unidades?.email || row.unidades?.telefone ? [row.unidades?.email, row.unidades?.telefone].filter(Boolean).join(" · ") : "Sem contato cadastrado"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Vencimento</p>
                      <p className="mt-1 text-sm text-slate-700">{formatDateBR(row.vencimento)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Valor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p>
                    </div>
                    <Link href={cobrancaUrl(row, baseParams)} className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                      Corrigir <ArrowRightLeft size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Ação</p>
          <h3 className="mt-2 text-base font-semibold text-slate-950">Unidade destino</h3>

          {!selectedCobranca ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">Escolha uma cobrança na lista para habilitar a troca de unidade.</p>
          ) : (
            <form action={alterarUnidadeCobrancaPeloSaneamento} className="mt-4 space-y-4">
              <input type="hidden" name="cobranca_id" value={selectedCobranca.id} />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Cobrança atual</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{selectedCobranca.condominios?.nome}</p>
                <p className="mt-1 text-sm text-slate-600">Unidade {unidadeLabel(selectedCobranca)}</p>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="unidade_destino_id">
                  Nova unidade
                </label>
                <SearchableSelect
                  id="unidade_destino_id"
                  name="unidade_destino_id"
                  options={unidadesDestino
                    .filter((unidade: any) => unidade.id !== selectedCobranca.unidade_id)
                    .map((unidade: any) => ({
                      value: unidade.id,
                      label: unidadeCompleta(unidade),
                    }))}
                  placeholder="Digite parte da unidade correta"
                  inputClassName="mt-2"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="observacao">
                  Observação
                </label>
                <textarea
                  id="observacao"
                  name="observacao"
                  placeholder="Ex.: cobrança importada na unidade 001201 sem responsável; mover para unidade 1201 com contato validado."
                  className="mt-2 min-h-[96px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
                />
              </div>

              <PendingSubmitButton icon={<ArrowRightLeft size={16} />} pendingLabel="Corrigindo..." className="w-full">
                Alterar unidade da cobrança
              </PendingSubmitButton>
            </form>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Possíveis unidades duplicadas</h3>
              <p className="mt-1 text-sm text-slate-500">
                Grupos com mesmo condomínio, bloco e identificação normalizada. Use como apoio para escolher a unidade destino da cobrança.
              </p>
            </div>
            <span className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 ring-1 ring-cyan-100">
              {duplicidadeRows.length} grupo(s)
            </span>
          </div>
        </div>

        {duplicidadeRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma duplicidade encontrada" description="Ajuste o filtro de condomínio ou busca para localizar agrupamentos suspeitos." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {duplicidadeRows.map((grupo) => (
              <div key={grupo.key} className="px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{grupo.condominio_nome}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Unidade {grupo.bloco ? `Bloco ${grupo.bloco} · ` : ""}{grupo.identificacao} · {grupo.totalUnidades} cadastros · {grupo.totalCobrancas} cobrança(s) · {grupo.totalAcordos} acordo(s)
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-100">
                    Destino sugerido: Unidade {grupo.destinoSugerido.bloco ? `Bloco ${grupo.destinoSugerido.bloco} · ` : ""}{grupo.destinoSugerido.identificacao}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 xl:grid-cols-2">
                  {grupo.unidades.map((unidade) => {
                    const isDestino = unidade.id === grupo.destinoSugerido.id;
                    return (
                      <div key={unidade.id} className={["rounded-xl border p-3", isDestino ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"].join(" ")}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">
                              Unidade {unidade.bloco ? `Bloco ${unidade.bloco} · ` : ""}{unidade.identificacao}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">{contatoResumo(unidade)}</p>
                          </div>
                          {isDestino ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">melhor destino</span>
                          ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{unidade.cobrancas} cobrança(s)</span>
                          <span>{unidade.acordos} acordo(s)</span>
                          <span>Status {unidade.status ?? "-"}</span>
                          <Link href={`/app/unidades/${unidade.id}`} className="font-semibold text-[var(--gkli-primary)] hover:underline">
                            Abrir unidade
                          </Link>
                          <Link href={`/app/gestao/saneamento-cobrancas?condominio_id=${grupo.condominio_id}&q=${encodeURIComponent(String(unidade.identificacao ?? ""))}`} className="font-semibold text-[var(--gkli-primary)] hover:underline">
                            Ver cobranças
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Unidades bloqueadas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{unidadesJudicializadas}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Condomínios afetados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{condominiosJudicializados}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Valor em observação</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(totalJudicializado)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-red-50 px-5 py-4 text-sm text-red-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p>
              Esta lista mostra cobranças de unidades com ao menos uma cobrança judicializada. Use para suspender vincendas, manter em acompanhamento ou encaminhar orientação ao gestor da carteira.
            </p>
          </div>
        </div>

        {judicialRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma unidade bloqueada" description="Não há cobranças vinculadas a unidades com judicialização ativa no escopo atual." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {judicialRows.map((row: any) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 hover:bg-slate-50 xl:grid-cols-[minmax(260px,1fr)_180px_140px_140px_110px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Unidade judicializada</span>
                    <StatusBadge status={getCobrancaStatusOperacional(row)} />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">{row.condominios?.nome ?? "Condomínio não informado"}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">Unidade {unidadeLabel(row)} · {row.unidades?.responsavel_nome ?? "Responsável não informado"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Vencimento</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDateBR(row.vencimento)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Competência</p>
                  <p className="mt-1 text-sm text-slate-700">{row.competencia ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Valor</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p>
                </div>
                <Link href={`/app/cobrancas/${row.id}`} className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">
                  Abrir <ArrowUpRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
