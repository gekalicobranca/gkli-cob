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
import { ArrowRight, Search as SearchIcon, Plus, CircleX, FileCheck2, Sparkles, Building2, CalendarDays, ExternalLink } from "lucide-react";
import { EasyHeader, EasySteps, EasyEmpty } from "@/components/easy/easy-ui";
import styles from "@/components/easy/easy.module.css";

const operations = [
  { key: "consultar", title: "Consultar", description: "Encontre o acordo e acompanhe suas parcelas.", color: styles.blue, icon: SearchIcon, trail: "Localizar e acompanhar" },
  { key: "criar", title: "Criar", description: "Escolha as cobranças e monte as condições do acordo.", color: styles.green, icon: Plus, trail: "Simular e criar" },
  { key: "cancelar", title: "Cancelar", description: "Revise o acordo e registre o cancelamento.", color: styles.rose, icon: CircleX, trail: "Revisar e cancelar" },
  { key: "efetivar", title: "Efetivar", description: "Anexe o PDF da administradora e confira as parcelas.", color: styles.violet, icon: FileCheck2, trail: "Conferir e efetivar" },
];
type Search = { operacao?: string; condominio?: string; unidade?: string; acordo?: string };
type Row = AcordoEasy & { id: string; nome?: string; identificacao?: string; bloco?: string; unidade_id?: string; status_operacional?: string; status_financeiro?: string; data_acordo?: string; valor_acordado?: number };
const cobrancaAtiva = (charge: Row) =>
  (COBRANCA_STATUS_OPERACIONAIS_ATIVOS as readonly string[]).includes(getCobrancaStatusOperacional(charge)) &&
  !["quitado", "renegociado"].includes(getCobrancaStatusFinanceiro(charge));
const panelClass = `${styles.panel} space-y-4`;

export default async function EasyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const scope = await getPermittedCarteiras();
  const operation = operations.find(item => item.key === query.operacao);
  if (query.operacao && !operation) notFound();

  if (!operation) return <div className={styles.container}>
    <header className={styles.hero}>
      <span className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" />Easy Cob <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[9px] tracking-widest">Lab</span></span>
      <h1>O que você quer fazer?</h1>
      <p>Escolha uma ação. A gente guia você até o próximo passo.</p>
    </header>
    <div className={styles.grid}>
      {operations.map(item => <Link key={item.key} href={`/app/configuracoes/lab/easy?operacao=${item.key}`} className={`${styles.card} ${item.color}`}>
        <span className={styles.icon}><item.icon size={23} strokeWidth={1.8} aria-hidden="true" /></span>
        <div><h2>{item.title}</h2><p className="mt-2">{item.description}</p></div>
        <span className={styles.cardFooter}>{item.trail}<ArrowRight size={18} aria-hidden="true" /></span>
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

  return <div className={`${styles.container} ${operation.color} space-y-5`}>
    <div><EasyHeader title={`${operation.title}${operation.key === "cancelar" ? " acordo" : ""}`} description={operation.description} />
      <EasySteps labels={operation.key === "criar" ? ["Localizar unidade", "Escolher cobranças", "Simular acordo"]
        : operation.key === "consultar" ? ["Localizar unidade", "Acompanhar acordo"]
          : ["Localizar acordo", operation.key === "efetivar" ? "Conferir PDF" : "Revisar cancelamento"]} current={unit ? 1 : 0} />
    </div>
    <EasyFilters operation={operation.key} condominium={condominium?.id ?? ""} unit={unit?.id ?? ""}
      condominiums={condominiums.map(item => ({ id: item.id, label: item.nome ?? item.id }))}
      units={units.map(item => ({ id: item.id, label: [item.bloco && `Bloco ${item.bloco}`, item.identificacao].filter(Boolean).join(" · ") }))} />
    {!unit && <EasyEmpty title={condominium && !units.length ? "Nenhuma unidade disponível para esta ação" : "Vamos localizar a unidade"}
      description={condominium && !units.length ? "Escolha outro condomínio ou consulte os acordos para acompanhar a situação das unidades." : "Busque o condomínio e digite a unidade ou o bloco. As opções já estão filtradas para esta ação."} />}
    {unit && <aside aria-label="Resumo da operação" className={styles.context}>
      <div className="flex items-center gap-3"><span className={styles.icon}><Building2 size={20} aria-hidden="true" /></span><div>
        <p>{condominium!.nome}</p><strong>{[unit.bloco && `Bloco ${unit.bloco}`, `Unidade ${unit.identificacao}`].filter(Boolean).join(" · ")}</strong>
      </div></div>
      {detail && <span className={closed ? "rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500" : styles.badge}>{detail.acordo.status.replaceAll("_", " ")}</span>}
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
    <div className={detail && ["cancelar", "efetivar"].includes(operation.key) ? "grid items-start gap-5 lg:grid-cols-2" : "space-y-5"}>
    {detail && <section className={panelClass}>
      <h2 className="text-xl font-semibold">Acordo da unidade</h2>
      {agreements.length > 1 && <EasyAgreementSelect selected={selectedAgreement!.id}
        options={recentAgreements.map(item => ({
          id: item.id,
          label: `${formatarVencimentoAcordo(item.data_acordo)} · ${formatCurrency(item.valor_acordado)} · ${item.status?.replaceAll("_", " ")}`,
        }))} />}
      <div className={styles.totalBand}><div><p>Valor do acordo</p><strong>{formatCurrency(detail.acordo.valor_acordado)}</strong></div>
        <div className="text-right"><p className="flex items-center gap-2"><CalendarDays size={14} aria-hidden="true" />{formatarVencimentoAcordo(detail.acordo.data_acordo)}</p>
          <span className="mt-2 block text-sm">{detail.parcelas.length} parcela(s)</span></div></div>
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-100"><table className="w-full text-left text-sm">
        <caption className="sr-only">Parcelas do acordo</caption><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr>
          <th scope="col" className="p-3 font-medium">Parcela</th><th scope="col" className="p-3 font-medium">Vencimento</th><th scope="col" className="p-3 text-right font-medium">Valor</th><th scope="col" className="p-3 font-medium">Situação</th>
        </tr></thead><tbody className="divide-y divide-slate-100">{detail.parcelas.map(parcel => <tr key={parcel.id} className="hover:bg-slate-50/80">
          <td className="p-3">{parcel.numero === 0 ? "Entrada" : String(parcel.numero).padStart(2, '0')}</td><td className="whitespace-nowrap p-3 text-slate-600">{formatarVencimentoAcordo(parcel.vencimento)}</td>
          <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums">{formatCurrency(parcel.valor)}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{parcel.status}</span></td>
        </tr>)}</tbody></table></div>
      <Link className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-800" href={`/app/acordos/${detail.acordo.id}`}>Abrir detalhes do acordo<ExternalLink size={13} aria-hidden="true" /></Link>
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
    </div>
  </div>;
}
