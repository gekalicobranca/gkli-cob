import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { somenteAcordosCanonicos } from "@/lib/core/acordo-arquivamento";
import { somenteCobrancasCanonicas } from "@/lib/core/cobranca-arquivamento";
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from "@/lib/constants/cobrancas";
import { getCobrancaStatusFinanceiro, getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import { listCobrancasDaUnidadeParaAcordo, getAcordoDetalhe } from "@/features/acordos/queries";
import { ACORDO_STATUS_VIGENTES } from "@/lib/constants/acordos";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatarVencimentoAcordo } from "@/features/acordos/formatar-vencimento";
import { EasyFilters, EasyAgreementSelect } from "./filters";
import { EasyCancellation } from "./cancellation";
import { EasyCharges } from "./charges";
import { EasyPdfAgreement } from "./pdf-agreement";
import { valorCotaParaAcordo } from "@/features/acordos/valor-cota";
import { acordoDisponivelEasy, type AcordoEasy } from "@/features/acordos/easy-disponibilidade";

const operations = [
  { key: "consultar", title: "Consultar", description: "Veja o acordo da unidade.", color: "border-blue-200 bg-blue-50 text-blue-900", icon: "⌕" },
  { key: "criar", title: "Criar", description: "Selecione cobranças e simule um acordo.", color: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "+" },
  { key: "cancelar", title: "Cancelar", description: "Localize e cancele um acordo.", color: "border-rose-200 bg-rose-50 text-rose-900", icon: "×" },
  { key: "efetivar", title: "Efetivar", description: "Confira o retorno da administradora.", color: "border-violet-200 bg-violet-50 text-violet-900", icon: "✓" },
];
type Search = { operacao?: string; condominio?: string; unidade?: string; acordo?: string };
type Row = AcordoEasy & { id: string; nome?: string; identificacao?: string; bloco?: string; unidade_id?: string; status_operacional?: string; status_financeiro?: string; data_acordo?: string; valor_acordado?: number };
const cobrancaAtiva = (charge: Row) =>
  (COBRANCA_STATUS_OPERACIONAIS_ATIVOS as readonly string[]).includes(getCobrancaStatusOperacional(charge)) &&
  !["quitado", "renegociado"].includes(getCobrancaStatusFinanceiro(charge));
const panelClass = "space-y-4 rounded-2xl border border-slate-200 bg-white p-5";

export default async function EasyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const scope = await getPermittedCarteiras();
  const operation = operations.find(item => item.key === query.operacao);
  if (query.operacao && !operation) notFound();

  if (!operation) return <div className="space-y-6">
    <p className="text-sm font-semibold text-slate-500">Operação simplificada</p>
    <h1 className="text-3xl font-bold tracking-tight">O que vc quer fazer?</h1>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {operations.map(item => <Link key={item.key} href={`/app/configuracoes/lab/easy?operacao=${item.key}`} className={`flex min-h-52 flex-col gap-3 rounded-2xl border p-6 ${item.color}`}>
        <span aria-hidden="true" className="text-3xl">{item.icon}</span>
        <h2 className="text-2xl font-semibold">{item.title}</h2>
        <p className="text-sm">{item.description}</p>
        <span className="mt-auto text-sm font-semibold">Começar →</span>
      </Link>)}
    </div>
  </div>;

  const db = await createClient();
  // All lists are scoped and paginated to avoid truncating larger portfolios.
  async function rows(table: string, columns: string, order: string, filters: Record<string, string> = {}) {
    let request = applyCarteiraScope(db.from(table).select(columns), scope.carteiraIds).order(order).order("id");
    for (const [column, value] of Object.entries(filters)) request = request.eq(column, value);
    if (table === "acordos") request = somenteAcordosCanonicos(request);
    if (table === "cobrancas") request = somenteCobrancasCanonicas(request);
    const result: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await request.range(offset, offset + 499);
      if (error) throw new Error("Não foi possível carregar os dados da operação.");
      result.push(...data);
      if (data.length < 500) return result;
    }
  }

  const condominiums = await rows("condominios", "id,nome", "nome");
  const condominium = condominiums.find(item => item.id === query.condominio);
  if (query.condominio && !condominium) notFound();
  const allUnits = condominium
    ? await rows("unidades", "id,identificacao,bloco", "identificacao", { condominio_id: condominium.id })
    : [];
  const condominiumAgreements = condominium && operation.key !== "criar"
    ? (await rows("acordos", `id,unidade_id,status,tipo,data_acordo,valor_acordado,acordo_homologado,
      exige_aprovacao_sindico,sindico_aprovado_em${operation.key === "cancelar" ? ",parcelas:parcelas_acordo(status,data_pagamento)" : ""}`,
      "data_acordo", { condominio_id: condominium.id })).filter(item => acordoDisponivelEasy(item, operation.key))
    : [];
  const unitsWithAgreements = operation.key !== "criar"
    ? new Set(condominiumAgreements.map(item => item.unidade_id)) : null;
  const unitsWithCharges = condominium && operation.key === "criar"
    ? new Set((await rows("cobrancas", "id,unidade_id,status,status_operacional,status_financeiro", "id", { condominio_id: condominium.id }))
      .filter(cobrancaAtiva).map(item => item.unidade_id))
    : null;
  const eligibleUnits = unitsWithAgreements ?? unitsWithCharges;
  const units = eligibleUnits ? allUnits.filter(item => eligibleUnits.has(item.id)) : allUnits;
  const unit = units.find(item => item.id === query.unidade);
  if (query.unidade && !allUnits.some(item => item.id === query.unidade)) notFound();
  const agreements = unit ? condominiumAgreements.filter(item => item.unidade_id === unit.id) : [];
  const recentAgreements = [...agreements].reverse();
  const selectedAgreement = agreements.find(item => item.id === query.acordo)
    ?? recentAgreements.find(item => (ACORDO_STATUS_VIGENTES as readonly string[]).includes(item.status ?? ""))
    ?? recentAgreements[0];
  if (query.acordo && !agreements.some(item => item.id === query.acordo)) notFound();
  const detail = selectedAgreement ? await getAcordoDetalhe(selectedAgreement.id, scope) : null;
  const charges = unit && operation.key === "criar"
    ? (await listCobrancasDaUnidadeParaAcordo({ scope, unidadeId: unit.id })).cobrancas.filter(cobrancaAtiva)
    : [];
  const canWrite = ["admin", "gestor", "operador"].includes(scope.perfil);
  const closed = ["cancelado", "quitado", "rompido", "quebrado", "renegociado"].includes(detail?.acordo.status ?? "");
  const paid = detail?.parcelas.some(parcel =>
    parcel.data_pagamento || ["paga", "pago", "quitada", "quitado"].includes(String(parcel.status))) ?? false;
  let debtDownload: string | undefined;
  if (detail?.acordo.status === "cancelado" && operation.key === "cancelar") {
    const { data: attachment, error } = await db.from("timeline_operacional")
      .select("payload").eq("entidade_tipo", "acordo").eq("entidade_id", detail.acordo.id)
      .eq("carteira_id", detail.acordo.carteira_id).eq("evento_tipo", "acordo.debito_atualizado_anexado")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Não foi possível consultar o anexo do cancelamento.");
    const path = attachment?.payload?.storage_path;
    if (typeof path === "string" && new RegExp(`^easy/debitos/${detail.acordo.id}/[a-f0-9-]+\\.pdf$`).test(path)) {
      const { data } = await createAdminClient().storage.from("acordos-pdfs").createSignedUrl(path, 600);
      debtDownload = data?.signedUrl;
    }
  }

  return <div className="mx-auto max-w-4xl space-y-5">
    <Link className="text-sm font-semibold text-cyan-800" href="/app/configuracoes/lab/easy">← Voltar ao painel</Link>
    <h1 className="text-3xl font-bold">{operation.title}{operation.key === "cancelar" ? " acordo" : ""}</h1>
    <EasyFilters operation={operation.key} condominium={condominium?.id ?? ""} unit={unit?.id ?? ""}
      condominiums={condominiums.map(item => ({ id: item.id, label: item.nome ?? item.id }))}
      units={units.map(item => ({ id: item.id, label: [item.bloco && `Bloco ${item.bloco}`, item.identificacao].filter(Boolean).join(" · ") }))} />
    {!unit && <p className="text-sm text-slate-600">Selecione o condomínio e a unidade para continuar.</p>}
    {unit && <aside aria-label="Resumo da operação" className="sticky top-2 z-10 rounded-xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
      <p className="font-semibold">{condominium!.nome} · {[unit.bloco && `Bloco ${unit.bloco}`, `Unidade ${unit.identificacao}`].filter(Boolean).join(" · ")}</p>
      {detail && <p className="text-sm">Acordo de {formatarVencimentoAcordo(detail.acordo.data_acordo)} · {detail.acordo.status.replaceAll("_", " ")} · {formatCurrency(detail.acordo.valor_acordado)}</p>}
    </aside>}
    {unit && operation.key === "criar" && <section className={panelClass}>
      <h2 className="text-xl font-semibold">Cobranças ativas</h2>
      {!charges.length ? <p>Nenhuma cobrança ativa disponível para novo acordo.</p> :
        <EasyCharges key={unit.id} canWrite={canWrite} charges={charges.map(charge => ({
          id: charge.id,
          label: `${charge.competencia || "Cobrança"} · ${formatarVencimentoAcordo(charge.vencimento)}`,
          value: valorCotaParaAcordo(charge),
        }))} />}
    </section>}
    {unit && operation.key !== "criar" && !detail && <p className={panelClass}>Nenhum acordo encontrado para esta unidade.</p>}
    {detail && <section className={panelClass}>
      <h2 className="text-xl font-semibold">Acordo da unidade</h2>
      {agreements.length > 1 && <EasyAgreementSelect selected={selectedAgreement!.id}
        options={recentAgreements.map(item => ({
          id: item.id,
          label: `${formatarVencimentoAcordo(item.data_acordo)} · ${formatCurrency(item.valor_acordado)} · ${item.status?.replaceAll("_", " ")}`,
        }))} />}
      <p className="text-sm text-slate-600">{detail.acordo.status} · {formatCurrency(detail.acordo.valor_acordado)}</p>
      <ul className="divide-y divide-slate-100">
        {detail.parcelas.map(parcel => <li key={parcel.id} className="py-2 text-sm">
          Parcela {parcel.numero} · {formatarVencimentoAcordo(parcel.vencimento)} · {formatCurrency(parcel.valor)} · {parcel.status}
        </li>)}
      </ul>
      <Link className="text-sm font-semibold text-cyan-800 underline" href={`/app/acordos/${detail.acordo.id}`}>Abrir detalhes do acordo</Link>
    </section>}
    {detail && operation.key === "efetivar" && <section className={panelClass}>
      <h2 className="text-xl font-semibold">Anexar acordo da administradora</h2>
      {detail.acordo.acordo_homologado ? <p role="status">Acordo já conferido com a administradora.</p>
        : canWrite && !closed && !(detail.acordo.exige_aprovacao_sindico && !detail.acordo.sindico_aprovado_em)
          ? <EasyPdfAgreement key={detail.acordo.id} id={detail.acordo.id} />
          : <p>Confira as pendências e a situação do acordo nos detalhes para continuar.</p>}
    </section>}
    {detail && operation.key === "cancelar" && <section className={panelClass}>
      {detail.acordo.status === "cancelado" ? <div role="status" className="space-y-2">
        <p>Acordo cancelado.</p>
        {debtDownload && <a href={debtDownload} target="_blank" rel="noopener noreferrer" className="text-cyan-800 underline">Ver débito atualizado</a>}
      </div> : canWrite && !closed && !paid ? <EasyCancellation key={detail.acordo.id} id={detail.acordo.id} />
        : <p>Este acordo não permite cancelamento por este fluxo. Consulte os detalhes do acordo.</p>}
    </section>}
  </div>;
}
